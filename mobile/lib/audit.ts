import { Platform } from 'react-native';
import { getDB, generateId, isPhoneClient, isLocalDB } from './db';
import { notifyDataChange } from './sync';
import { useSettingsStore } from '../stores/settingsStore';
import { useSessionStore } from '../stores/sessionStore';

// ─── Audit log ────────────────────────────────────────────────────────────────
// Catatan permanen setiap perubahan penting (batal order, ubah harga, stok manual,
// pengaturan, PIN salah, reset). Di SQLite HP tabel ini dikunci trigger: baris tidak
// bisa diubah/dihapus, termasuk lewat /api/query dari perangkat staf.

export const AUDIT_LABEL: Record<string, string> = {
  order_batal: 'Order dibatalkan',
  order_tambah_item: 'Item ditambah ke order',
  menu_baru: 'Menu baru',
  menu_ubah: 'Menu diubah',
  stok_manual: 'Stok bahan diubah manual',
  pengaturan_ubah: 'Pengaturan diubah',
  pin_salah: 'PIN owner salah',
  login_gagal: 'Login petugas gagal',
  petugas_ubah: 'Data petugas diubah',
  reset_data: 'Semua data direset',
  // Tidak tampil di Riwayat Perubahan — dipakai untuk ringkasan per petugas
  order_baru: 'Order baru',
  login: 'Login',
  logout: 'Logout',
};

/** Aksi rutin: dicatat, tapi bukan "perubahan" yang perlu dicek owner. */
const ROUTINE = new Set(['order_baru', 'login', 'logout']);

export interface AuditRow {
  id: string; action: string; entity: string; entity_id: string;
  detail: string; actor: string; created_at: string;
}

function deviceLabel(): string {
  if (Platform.OS !== 'web') return 'HP Utama';
  return isPhoneClient() ? 'Perangkat Staf' : 'Web';
}

/** Pelaku = petugas yang sedang login di perangkat ini (bukan nama yang diketik). */
export function getActor(): string {
  const p = useSessionStore.getState().petugas;
  return p ? `${p.name} · ${deviceLabel()}` : deviceLabel();
}

export async function logAudit(
  action: string, entity: string, entityId: string, detail: Record<string, any>, actor?: string,
): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      'INSERT INTO audit_log (id, action, entity, entity_id, detail, actor, synced, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      generateId(), action, entity, entityId, JSON.stringify(detail),
      actor ?? getActor(), 0, new Date().toISOString(),
    );
  } catch (e) {
    // Log gagal tidak boleh menggagalkan transaksi — tapi jangan diam-diam.
    console.warn('[audit] gagal mencatat:', e);
  }
}

export function parseDetail(row: { detail: string }): Record<string, any> {
  try { return JSON.parse(row.detail || '{}'); } catch { return {}; }
}

/** Ringkasan satu baris untuk ditampilkan di laporan. */
export function describeAudit(row: AuditRow): string {
  const d = parseDetail(row);
  const rp = (n: any) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
  switch (row.action) {
    case 'order_batal':
      return `Order ${row.entity_id.slice(-6).toUpperCase()} (${d.prevStatus}) ${rp(d.total)} — alasan: ${d.reason || '-'}`;
    case 'order_tambah_item':
      return `Order ${row.entity_id.slice(-6).toUpperCase()}: total ${rp(d.oldTotal)} → ${rp(d.newTotal)}`;
    case 'menu_baru':
      return `${d.name}: harga ${rp(d.sell_price)}, HPP ${rp(d.hpp)}, stok ${d.stock}`;
    case 'menu_ubah':
    case 'stok_manual':
    case 'pengaturan_ubah':
    case 'petugas_ubah':
      return `${d.name ? d.name + ': ' : ''}${Object.entries(d.changes ?? {})
        .map(([k, v]: [string, any]) => `${k} ${v[0]} → ${v[1]}`).join(', ')}`;
    case 'pin_salah':
      return d.ip ? `dari ${d.ip}` : '';
    case 'login_gagal':
      return `${d.name ?? ''}${d.ip ? ` dari ${d.ip}` : ''}`;
    default:
      return '';
  }
}

/** { field: [lama, baru] } untuk field yang berubah saja. */
export function diffFields(
  before: Record<string, any>, after: Record<string, any>, fields: string[],
): Record<string, [any, any]> {
  const out: Record<string, [any, any]> = {};
  for (const f of fields) {
    if (String(before[f] ?? '') !== String(after[f] ?? '')) out[f] = [before[f], after[f]];
  }
  return out;
}

// ─── PIN owner ────────────────────────────────────────────────────────────────

// Batas percobaan dipakai bersama PIN owner & PIN petugas: 5x salah → kunci 5 menit.
let _pinFails = 0;
let _pinLockedUntil = 0;
const LOCKED = { ok: false, error: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.' };

async function pinFailed(action: string, entityId: string, detail: Record<string, any>, actor?: string) {
  _pinFails++;
  if (_pinFails >= 5) { _pinFails = 0; _pinLockedUntil = Date.now() + 5 * 60_000; }
  await logAudit(action, action === 'pin_salah' ? 'pengaturan' : 'petugas', entityId, detail, actor);
}

export function hasOwnerPin(): boolean {
  const st = useSettingsStore.getState() as any;
  return isPhoneClient() ? !!st.pinSet : !!st.ownerPin;
}

/** Cek PIN di perangkat yang menyimpan PIN (HP utama / web owner).
 *  5x salah → terkunci 5 menit. Setiap salah dicatat ke audit log. */
export async function checkPinLocal(pin: string, actor?: string, ip?: string): Promise<{ ok: boolean; error?: string }> {
  const { ownerPin } = useSettingsStore.getState();
  if (!ownerPin) return { ok: true };
  if (Date.now() < _pinLockedUntil) return LOCKED;
  if (pin === ownerPin) { _pinFails = 0; return { ok: true }; }
  await pinFailed('pin_salah', '', ip ? { ip } : {}, actor);
  return { ok: false, error: 'PIN owner salah' };
}

/** Login di perangkat yang menyimpan data petugas (HP utama). staffId 'owner' = PIN owner. */
export async function checkStaffLoginLocal(
  staffId: string, pin: string, actor?: string, ip?: string,
): Promise<{ ok: boolean; error?: string; name?: string }> {
  if (staffId === 'owner') {
    if (!useSettingsStore.getState().ownerPin) return { ok: false, error: 'PIN owner belum diatur' };
    const r = await checkPinLocal(pin, actor ?? `Owner · ${deviceLabel()}`, ip);
    return r.ok ? { ok: true, name: 'Owner' } : r;
  }
  if (Date.now() < _pinLockedUntil) return LOCKED;
  const db = await getDB();
  const row = await db.getFirstAsync<any>('SELECT id, name, pin, active FROM staff WHERE id = ?', staffId);
  if (!row || !row.active) return { ok: false, error: 'Petugas tidak ditemukan / nonaktif' };
  if (row.pin === pin) { _pinFails = 0; return { ok: true, name: row.name }; }
  await pinFailed('login_gagal', staffId, { name: row.name, ...(ip ? { ip } : {}) }, actor ?? `${row.name} · ${deviceLabel()}`);
  return { ok: false, error: 'PIN salah' };
}

export async function verifyOwnerPin(pin: string): Promise<{ ok: boolean; error?: string }> {
  if (!isPhoneClient()) return checkPinLocal(pin);
  // Perangkat staf tidak pernah menerima PIN — verifikasi dilakukan di HP.
  try {
    const res = await fetch('/api/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, actor: getActor() }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi HP utama' };
  }
}

// ─── Batal order ──────────────────────────────────────────────────────────────

/** PIN owner wajib bila order sudah dibayar, atau yang membatalkan adalah kasir
 *  (kasir bisa menerima uang, tidak menandai bayar, lalu membatalkan). */
export function cancelNeedsPin(status: string): boolean {
  if (!hasOwnerPin()) return false;
  return status === 'selesai' || useSessionStore.getState().petugas?.role === 'kasir';
}

/** Satu-satunya jalur membatalkan order: status → batal, stok menu dikembalikan,
 *  dicatat ke audit log. Order yang sudah "selesai" (uang sudah diterima) wajib PIN
 *  owner bila PIN sudah diatur — di sinilah kerugian oleh karyawan biasanya terjadi. */
export async function cancelOrder(
  orderId: string, opts: { reason: string; pin?: string; actor?: string; pinVerified?: boolean },
): Promise<void> {
  const reason = opts.reason.trim();
  if (reason.length < 3) throw new Error('Alasan pembatalan wajib diisi');

  const db = await getDB();
  const order = await db.getFirstAsync<any>('SELECT * FROM orders WHERE id = ?', orderId);
  if (!order) throw new Error('Order tidak ditemukan');
  if (order.status === 'batal') throw new Error('Order sudah dibatalkan');
  const prevStatus: string = order.status;

  if (!opts.pinVerified && cancelNeedsPin(order.status)) {
    const r = await verifyOwnerPin(opts.pin ?? '');
    if (!r.ok) throw new Error(r.error || 'PIN owner salah');
  }

  // SQLite (HP / staf via HP) punya kolom synced di menus; Supabase tidak.
  const local = isLocalDB();
  const items = await db.getAllAsync<any>('SELECT * FROM order_items WHERE order_id = ?', orderId);
  const restored: Array<{ menuId: string; qty: number }> = [];
  for (const it of items) {
    const menu = await db.getFirstAsync<any>('SELECT id, stock FROM menus WHERE id = ?', it.menu_id);
    if (!menu) continue;
    const newStock = (Number(menu.stock) || 0) + (Number(it.qty) || 0);
    // Nilai absolut, bukan `stock = stock + ?` — parser SupabaseDB tidak paham ekspresi.
    if (local) await db.runAsync('UPDATE menus SET stock = ?, synced = ? WHERE id = ?', newStock, 0, it.menu_id);
    else await db.runAsync('UPDATE menus SET stock = ? WHERE id = ?', newStock, it.menu_id);
    restored.push({ menuId: it.menu_id, qty: it.qty });
  }

  await db.runAsync('UPDATE orders SET status = ?, synced = ? WHERE id = ?', 'batal', 0, orderId);
  await logAudit('order_batal', 'order', orderId, {
    prevStatus, total: order.total, reason, restored,
  }, opts.actor);
  notifyDataChange();
}

// ─── Pemeriksaan data ─────────────────────────────────────────────────────────

export interface IntegrityInput {
  orders: any[]; items: any[]; audits: AuditRow[]; menus: any[];
  start: string; end: string; // YYYY-MM-DD, inklusif
  today: string;
}

export interface IntegrityResult {
  cancelled: { count: number; total: number; afterPaid: number };
  cancelledNoLog: string[];     // order batal tanpa jejak prosedur → tidak sesuai
  discounted: { count: number; total: number };
  stalePending: string[];        // order belum selesai dari hari sebelumnya
  mismatched: string[];          // subtotal ≠ jumlah item, atau total ≠ subtotal+ppn−diskon
  menusBelowHpp: string[];
  menusNoHpp: string[];
  changes: AuditRow[];           // audit log dalam periode (tanpa aksi rutin), terbaru dulu
  pinFails: number;              // PIN owner + login petugas yang salah
  changedOrderIds: Set<string>;
  byActor: Array<{ actor: string; orders: number; total: number; cancelled: number }>;
  creatorOf: Record<string, string>; // order id → petugas yang membuat
}

const inRange = (iso: string, start: string, end: string) => {
  const d = (iso ?? '').slice(0, 10);
  return d >= start && d <= end;
};

export function checkIntegrity({ orders, items, audits, menus, start, end, today }: IntegrityInput): IntegrityResult {
  const periodOrders = orders.filter((o) => inRange(o.created_at, start, end));
  const periodAudits = audits
    .filter((a) => inRange(a.created_at, start, end) && !ROUTINE.has(a.action))
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

  // Siapa yang membuat tiap order (dari log order_baru)
  const creator: Record<string, string> = {};
  for (const a of audits) if (a.action === 'order_baru') creator[a.entity_id] = a.actor || '-';
  const actors: Record<string, { actor: string; orders: number; total: number; cancelled: number }> = {};
  for (const o of periodOrders) {
    const who = creator[o.id] ?? 'Tidak tercatat';
    const g = (actors[who] ??= { actor: who, orders: 0, total: 0, cancelled: 0 });
    if (o.status === 'batal') g.cancelled++;
    else { g.orders++; if (o.status === 'selesai') g.total += Number(o.total) || 0; }
  }

  // Pembatalan tercatat untuk order mana pun (order lama bisa dibatalkan di periode ini)
  const cancelLogs = audits.filter((a) => a.action === 'order_batal');
  const cancelledWithLog = new Set(cancelLogs.map((a) => a.entity_id));

  const cancelled = periodOrders.filter((o) => o.status === 'batal');
  const afterPaid = cancelLogs.filter(
    (a) => inRange(a.created_at, start, end) && parseDetail(a).prevStatus === 'selesai',
  ).length;

  const itemSum: Record<string, number> = {};
  for (const it of items) itemSum[it.order_id] = (itemSum[it.order_id] ?? 0) + (Number(it.subtotal) || 0);

  const mismatched = periodOrders.filter((o) => {
    const sub = Number(o.subtotal) || 0;
    const expectTotal = sub + (Number(o.tax) || 0) - (Number(o.discount) || 0);
    return Math.abs(sub - (itemSum[o.id] ?? 0)) > 1 || Math.abs((Number(o.total) || 0) - expectTotal) > 1;
  }).map((o) => o.id);

  const discountedOrders = periodOrders.filter((o) => o.status !== 'batal' && (Number(o.discount) || 0) > 0);

  return {
    cancelled: {
      count: cancelled.length,
      total: cancelled.reduce((s, o) => s + (Number(o.total) || 0), 0),
      afterPaid,
    },
    cancelledNoLog: cancelled.filter((o) => !cancelledWithLog.has(o.id)).map((o) => o.id),
    discounted: {
      count: discountedOrders.length,
      total: discountedOrders.reduce((s, o) => s + (Number(o.discount) || 0), 0),
    },
    stalePending: orders
      .filter((o) => (o.status === 'pending' || o.status === 'proses') && (o.created_at ?? '').slice(0, 10) < today)
      .map((o) => o.id),
    mismatched,
    menusBelowHpp: menus
      .filter((m) => m.is_active && Number(m.hpp) > 0 && Number(m.sell_price) < Number(m.hpp))
      .map((m) => m.name),
    menusNoHpp: menus.filter((m) => m.is_active && !(Number(m.hpp) > 0)).map((m) => m.name),
    changes: periodAudits,
    pinFails: periodAudits.filter((a) => a.action === 'pin_salah' || a.action === 'login_gagal').length,
    changedOrderIds: new Set(audits
      .filter((a) => a.action === 'order_batal' || a.action === 'order_tambah_item')
      .map((a) => a.entity_id)),
    byActor: Object.values(actors).sort((a, b) => b.total - a.total),
    creatorOf: creator,
  };
}
