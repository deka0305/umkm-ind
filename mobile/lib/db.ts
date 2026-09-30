import { Platform } from 'react-native';
import { supabase } from './supabase';

export interface AppDB {
  getFirstAsync<T = any>(sql: string, ...params: any[]): Promise<T | null>;
  getAllAsync<T = any>(sql: string, ...params: any[]): Promise<T[]>;
  runAsync(sql: string, ...params: any[]): Promise<any>;
  execAsync(sql: string): Promise<any>;
}

let _db: AppDB | null = null;

/**
 * Apakah web ini disajikan oleh server lokal HP (port 3333)?
 * Jika ya, semua query data dialihkan ke SQLite di HP via API lokal —
 * jalan tanpa internet dan datanya sama dengan yang di HP.
 */
export function isPhoneClient(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && window.location.port === '3333';
}

/** Data tersimpan di SQLite (HP utama, atau perangkat staf lewat server HP)? */
export function isLocalDB(): boolean {
  return Platform.OS !== 'web' || isPhoneClient();
}

export async function getDB(): Promise<AppDB> {
  if (_db) return _db;

  if (Platform.OS === 'web') {
    _db = isPhoneClient() ? new RemoteSQLiteDB() : new SupabaseDB();
    return _db;
  }

  const SQLite = await import('expo-sqlite');
  _db = await SQLite.openDatabaseAsync('umkm.db');
  await initSchema(_db);
  return _db;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── SQLite schema (native only) ─────────────────────────────────────────────

async function initSchema(db: AppDB) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS menus (id TEXT PRIMARY KEY, name TEXT NOT NULL, category_id TEXT, sell_price REAL NOT NULL DEFAULT 0, hpp REAL NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, stock INTEGER NOT NULL DEFAULT 0, image_uri TEXT, synced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS ingredients (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, current_stock REAL NOT NULL DEFAULT 0, unit TEXT NOT NULL, min_stock REAL NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS stock_movements (id TEXT PRIMARY KEY, ingredient_id TEXT, type TEXT NOT NULL, qty REAL NOT NULL, note TEXT, synced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, member_tier TEXT NOT NULL DEFAULT 'Bronze', total_orders INTEGER NOT NULL DEFAULT 0, total_spent REAL NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, customer_id TEXT, table_no TEXT, status TEXT NOT NULL DEFAULT 'pending', payment_method TEXT, subtotal REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, note TEXT, synced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, order_id TEXT, menu_id TEXT, qty INTEGER NOT NULL, price REAL NOT NULL, subtotal REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, customer_id TEXT, customer_name TEXT, booking_date TEXT NOT NULL, time TEXT NOT NULL, guests INTEGER NOT NULL DEFAULT 1, table_type TEXT, purpose TEXT, status TEXT NOT NULL DEFAULT 'menunggu', synced INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS purchase_orders (id TEXT PRIMARY KEY, supplier_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'menunggu', total REAL NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS po_items (id TEXT PRIMARY KEY, po_id TEXT, ingredient_id TEXT, qty REAL NOT NULL, unit TEXT NOT NULL, price REAL NOT NULL, synced INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO categories (id, name) VALUES ('cat-1','Makanan Berat'),('cat-2','Makanan Ringan'),('cat-3','Minuman'),('cat-4','Dessert');
  `);
  // Migrate existing tables — safe to ignore if column already exists
  try { await db.execAsync('ALTER TABLE bookings ADD COLUMN customer_name TEXT'); } catch {}
  try { await db.execAsync('ALTER TABLE menus ADD COLUMN image_uri TEXT'); } catch {}
  try { await db.execAsync('ALTER TABLE menus ADD COLUMN synced INTEGER NOT NULL DEFAULT 0'); } catch {}
  // HPP saat terjual — laporan lama tidak berubah bila HPP menu diubah belakangan
  try { await db.execAsync('ALTER TABLE order_items ADD COLUMN hpp REAL'); } catch {}

  // Akun petugas — hanya di HP utama, tidak disinkron ke Supabase (PIN tidak boleh keluar HP).
  // /api/query menolak semua akses ke tabel ini dari perangkat staf.
  await db.execAsync(`CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY, name TEXT NOT NULL, pin TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));`);

  // Audit log — append-only. Trigger menolak UPDATE (kecuali flag synced) dan DELETE,
  // termasuk dari perangkat staf lewat /api/query dan dari Reset Semua Data.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, action TEXT NOT NULL, entity TEXT, entity_id TEXT, detail TEXT, actor TEXT, synced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
      BEGIN SELECT RAISE(ABORT, 'audit_log tidak boleh dihapus'); END;
    CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
      WHEN NEW.id IS NOT OLD.id OR NEW.action IS NOT OLD.action OR NEW.entity IS NOT OLD.entity
        OR NEW.entity_id IS NOT OLD.entity_id OR NEW.detail IS NOT OLD.detail
        OR NEW.actor IS NOT OLD.actor OR NEW.created_at IS NOT OLD.created_at
      BEGIN SELECT RAISE(ABORT, 'audit_log tidak boleh diubah'); END;
  `);
}

// ─── localStorage fallback (web) ─────────────────────────────────────────────
// Dipakai saat tabel Supabase belum dibuat (404). Data tersimpan di browser.

function lsKey(table: string) { return `umkm_${table}`; }

function lsGetAll(table: string): any[] {
  try { return JSON.parse(localStorage.getItem(lsKey(table)) ?? '[]'); }
  catch { return []; }
}

function lsSave(table: string, obj: Record<string, any>): void {
  const rows = lsGetAll(table);
  const idx = rows.findIndex((r) => r.id === obj.id);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...obj };
  else rows.push(obj);
  try { localStorage.setItem(lsKey(table), JSON.stringify(rows)); } catch {}
}

function lsUpdate(table: string, updates: Record<string, any>, whereCol: string, whereVal: any): void {
  const rows = lsGetAll(table).map((r) => r[whereCol] === whereVal ? { ...r, ...updates } : r);
  try { localStorage.setItem(lsKey(table), JSON.stringify(rows)); } catch {}
}

// Tabel yang belum ada di Supabase (fallback ke localStorage)
const LS_TABLES = new Set<string>(['audit_log']);

// ─── Remote SQLite Adapter (web yang disajikan server HP) ────────────────────
// Meneruskan SQL apa adanya ke HP via POST /api/query — dieksekusi di SQLite HP.

class RemoteSQLiteDB implements AppDB {
  private async call(op: string, sql: string, params: any[]): Promise<any> {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, sql, params }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Query ke server HP gagal');
    return json;
  }

  async getAllAsync<T = any>(sql: string, ...params: any[]): Promise<T[]> {
    return (await this.call('all', sql, params)).rows ?? [];
  }

  async getFirstAsync<T = any>(sql: string, ...params: any[]): Promise<T | null> {
    return (await this.call('first', sql, params)).row ?? null;
  }

  async runAsync(sql: string, ...params: any[]): Promise<any> {
    return (await this.call('run', sql, params)).result;
  }

  async execAsync(sql: string): Promise<any> {
    await this.call('exec', sql, []);
  }
}

// ─── Supabase DB Adapter (web) ────────────────────────────────────────────────

class SupabaseDB {
  // no-op: schema is managed in Supabase dashboard
  async execAsync(): Promise<void> {}

  async getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]> {
    const upper = sql.toUpperCase();

    // ── Revenue by date (GROUP BY + date() from orders) ──────────────────────
    if (upper.includes('GROUP BY') && upper.includes('DATE(CREATED_AT)') && upper.includes('FROM ORDERS')) {
      const { data: orders } = await supabase.from('orders').select('*');
      let rows = (orders ?? []).filter((r) => r.status === 'selesai');
      if (params.length >= 2) {
        const [start, end] = params as string[];
        rows = rows.filter((r) => {
          const d = (r.created_at ?? '').slice(0, 10);
          return d >= start && d <= end;
        });
      }
      const grouped: Record<string, { tgl: string; revenue: number; tax: number; jml_order: number }> = {};
      for (const r of rows) {
        const tgl = (r.created_at ?? '').slice(0, 10);
        if (!tgl) continue;
        if (!grouped[tgl]) grouped[tgl] = { tgl, revenue: 0, tax: 0, jml_order: 0 };
        grouped[tgl].revenue += r.total ?? 0;
        grouped[tgl].tax += r.tax ?? 0;
        grouped[tgl].jml_order += 1;
      }
      return Object.values(grouped).sort((a, b) => a.tgl.localeCompare(b.tgl)) as T[];
    }

    // ── Breakdown per metode bayar (GROUP BY payment_method) ─────────────────
    if (upper.includes('GROUP BY') && upper.includes('PAYMENT_METHOD') && upper.includes('FROM ORDERS')) {
      const { data: orders } = await supabase.from('orders').select('*');
      let rows = (orders ?? []).filter((r) => r.status === 'selesai');
      if (params.length >= 2) {
        const [start, end] = params as string[];
        rows = rows.filter((r) => {
          const d = (r.created_at ?? '').slice(0, 10);
          return d >= start && d <= end;
        });
      }
      const grouped: Record<string, { payment_method: string; count: number; total: number }> = {};
      for (const r of rows) {
        const method = r.payment_method || 'Tidak diketahui';
        if (!grouped[method]) grouped[method] = { payment_method: method, count: 0, total: 0 };
        grouped[method].count += 1;
        grouped[method].total += r.total ?? 0;
      }
      return Object.values(grouped).sort((a, b) => b.total - a.total) as T[];
    }

    // ── Top menus (JOIN order_items + menus + orders) ─────────────────────────
    if (upper.includes('GROUP BY') && upper.includes('JOIN MENUS') && upper.includes('JOIN ORDERS')) {
      const [{ data: orderItems }, { data: menus }, { data: orders }] = await Promise.all([
        supabase.from('order_items').select('*'),
        supabase.from('menus').select('*'),
        supabase.from('orders').select('*'),
      ]);
      const menuMap: Record<string, string> = {};
      for (const m of menus ?? []) menuMap[m.id] = m.name;

      let validOrders = (orders ?? []).filter((o) => o.status === 'selesai');
      if (params.length >= 2) {
        const [start, end] = params as string[];
        validOrders = validOrders.filter((o) => {
          const d = (o.created_at ?? '').slice(0, 10);
          return d >= start && d <= end;
        });
      }
      const validIds = new Set(validOrders.map((o) => o.id));

      const grouped: Record<string, { name: string; qty: number; revenue: number }> = {};
      for (const oi of orderItems ?? []) {
        if (!validIds.has(oi.order_id)) continue;
        const mid = oi.menu_id;
        if (!grouped[mid]) grouped[mid] = { name: menuMap[mid] ?? 'Unknown', qty: 0, revenue: 0 };
        grouped[mid].qty += oi.qty ?? 0;
        grouped[mid].revenue += oi.subtotal ?? 0;
      }
      const limitMatch2 = sql.match(/LIMIT\s+(\d+)/i);
      const lim = limitMatch2 ? parseInt(limitMatch2[1]) : 999;
      return Object.values(grouped).sort((a, b) => b.qty - a.qty).slice(0, lim) as T[];
    }

    // ── Total HPP terjual (SUM qty × menus.hpp) ───────────────────────────────
    if (upper.includes('M.HPP') && upper.includes('JOIN MENUS') && upper.includes('JOIN ORDERS')) {
      const [{ data: orderItems }, { data: menus }, { data: orders }] = await Promise.all([
        supabase.from('order_items').select('*'),
        supabase.from('menus').select('id, hpp'),
        supabase.from('orders').select('id, status, created_at'),
      ]);
      const hppMap: Record<string, number> = {};
      for (const m of menus ?? []) hppMap[m.id] = m.hpp ?? 0;
      const [start, end] = params as string[];
      const validIds = new Set((orders ?? [])
        .filter((o) => o.status === 'selesai')
        .filter((o) => { const d = (o.created_at ?? '').slice(0, 10); return d >= start && d <= end; })
        .map((o) => o.id));
      let hpp = 0;
      for (const oi of orderItems ?? []) {
        if (validIds.has(oi.order_id)) hpp += (oi.qty ?? 0) * (oi.hpp ?? hppMap[oi.menu_id] ?? 0);
      }
      return [{ hpp }] as T[];
    }

    // ── Daftar PO + jumlah item (GROUP BY po.id) ─────────────────────────────
    if (upper.includes('GROUP BY') && upper.includes('FROM PURCHASE_ORDERS')) {
      const [{ data: pos }, { data: items }] = await Promise.all([
        supabase.from('purchase_orders').select('*'),
        supabase.from('po_items').select('po_id'),
      ]);
      const counts: Record<string, number> = {};
      for (const it of items ?? []) counts[it.po_id] = (counts[it.po_id] ?? 0) + 1;
      return (pos ?? [])
        .map((p) => ({ ...p, item_count: counts[p.id] ?? 0 }))
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')) as T[];
    }

    // ── Bookings (fallback ke localStorage kalau Supabase 404) ───────────────
    if (upper.includes('FROM BOOKINGS')) {
      const { data, error } = await supabase.from('bookings').select('*');
      let rows: any[];
      if (error) {
        rows = lsGetAll('bookings'); // localStorage fallback
      } else {
        rows = data ?? [];
      }
      rows = rows.sort((a, b) => (b.booking_date ?? '').localeCompare(a.booking_date ?? ''));
      const limitM = sql.match(/LIMIT\s+(\d+)/i);
      if (limitM) rows = rows.slice(0, parseInt(limitM[1]));
      return rows.map((r: any) => ({ ...r, customer_name: r.customer_name ?? 'Tamu' })) as T[];
    }

    // Agregat yang belum punya penanganan khusus di atas: fallback di bawah
    // hanya mengembalikan baris mentah — angkanya akan salah tanpa ada tanda.
    // Lebih baik gagal berisik daripada laporan yang keliru.
    if (upper.includes('GROUP BY') || /\b(COUNT|SUM|AVG)\s*\(/i.test(sql)) {
      throw new Error(`SupabaseDB: agregat SQL ini belum didukung — ${sql}`);
    }

    const table = getTable(sql);
    if (!table) return [];

    // Tabel yang fallback ke localStorage bila belum ada di Supabase
    if (LS_TABLES.has(table)) {
      const { data, error } = await supabase.from(table).select('*');
      if (error) return lsGetAll(table) as T[];
      return (data ?? []) as T[];
    }

    const { data, error } = await supabase.from(table).select('*');
    if (error) { console.warn(`Supabase getAllAsync [${table}]: ${error.message}`); return []; }

    let rows: any[] = data ?? [];

    if (table === 'categories' && rows.length === 0) {
      const defaults = [
        { id: 'cat-1', name: 'Makanan Berat' },
        { id: 'cat-2', name: 'Makanan Ringan' },
        { id: 'cat-3', name: 'Minuman' },
        { id: 'cat-4', name: 'Dessert' },
      ];
      await supabase.from('categories').upsert(defaults);
      rows = defaults;
    }

    // WHERE current_stock <= min_stock (stok kritis)
    if (sql.includes('current_stock <= min_stock')) {
      rows = rows.filter((r) => r.current_stock <= r.min_stock);
    }

    // Simple WHERE col = ? with params
    const whereSimple = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
    if (whereSimple && params.length > 0) {
      const col = whereSimple[1];
      rows = rows.filter((r) => r[col] === params[0]);
    }

    // ORDER BY
    const orderMatch = sql.match(/ORDER BY\s+(\w+)(\s+DESC)?/i);
    if (orderMatch) {
      const field = orderMatch[1];
      const desc = !!orderMatch[2];
      rows.sort((a, b) => {
        const av = a[field] ?? '';
        const bv = b[field] ?? '';
        if (av < bv) return desc ? 1 : -1;
        if (av > bv) return desc ? -1 : 1;
        return 0;
      });
    }

    // LIMIT
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) rows = rows.slice(0, parseInt(limitMatch[1]));

    return rows as T[];
  }

  async getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null> {
    // Aggregate: COUNT + SUM untuk orders
    if (/COUNT|SUM/i.test(sql)) {
      const table = getTable(sql);
      if (!table) return null;

      const { data } = await supabase.from(table).select('*');
      let rows: any[] = data ?? [];

      // Filter status AND (optionally) date
      if (sql.includes("status='selesai'") && params[0]) {
        rows = rows.filter(
          (r) => r.status === 'selesai' && (r.created_at ?? '').startsWith(params[0])
        );
      } else if (sql.includes("status='selesai'")) {
        rows = rows.filter((r) => r.status === 'selesai');
      } else if (sql.includes("status='pending'")) {
        rows = rows.filter((r) => r.status === 'pending');
      }

      return {
        cnt: rows.length,
        rev: rows.reduce((s, r) => s + (r.total ?? 0), 0),
      } as T;
    }

    const rows = await this.getAllAsync<T>(sql, ...params);
    return rows[0] ?? null;
  }

  async runAsync(sql: string, ...params: any[]): Promise<{ error?: any }> {
    const upper = sql.trim().toUpperCase();

    if (upper.startsWith('INSERT')) {
      const tableMatch = sql.match(/INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+(\w+)/i);
      const colMatch = sql.match(/\(([^)]+)\)\s+VALUES/i);
      if (!tableMatch || !colMatch) return {};

      const table = tableMatch[1];
      const cols = colMatch[1].split(',').map((c) => c.trim());
      const valMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
      const valTokens = valMatch ? valMatch[1].split(',').map((v) => v.trim()) : [];
      const obj: Record<string, any> = {};
      let pi = 0;
      cols.forEach((col, i) => {
        const tok = valTokens[i] ?? '?';
        if (tok === '?') {
          obj[col] = params[pi++] ?? null;
        } else if (/^'.*'$/.test(tok)) {
          obj[col] = tok.slice(1, -1);
        } else if (tok.toLowerCase().includes('datetime') || tok.toLowerCase().includes('now')) {
          obj[col] = new Date().toISOString();
        } else if (!isNaN(Number(tok))) {
          obj[col] = Number(tok);
        }
      });

      // Strip null values — prevents "column does not exist" errors for optional columns
      // Convert is_active 0/1 to boolean for Supabase compatibility
      const upsertObj = Object.fromEntries(
        Object.entries(obj)
          .filter(([, v]) => v !== null)
          .map(([k, v]) => [k, k === 'is_active' && (v === 0 || v === 1) ? v === 1 : v])
      );
      const { error } = await supabase.from(table).upsert(upsertObj);
      if (error) {
        if (LS_TABLES.has(table)) {
          lsSave(table, obj); // localStorage fallback
          return {};
        }
        console.error('Supabase insert:', error.message);
        return { error };
      }

    } else if (upper.startsWith('UPDATE')) {
      const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
      if (!tableMatch) return {};
      const table = tableMatch[1];

      // Toggle is_active
      if (sql.includes('CASE WHEN')) {
        const id = params[0];
        const { data } = await supabase.from(table).select('is_active').eq('id', id).single();
        if (data) {
          // is_active bertipe integer di Postgres — kirim 1/0, bukan boolean
          await supabase.from(table).update({ is_active: data.is_active ? 0 : 1 }).eq('id', id);
        }
        return {};
      }

      // Kurangi stok: SET stock = MAX(0, stock - ?) — read-modify-write.
      // Tidak bisa lewat parser umum di bawah: koma di dalam MAX() memecah
      // ekspresinya jadi kolom palsu dan seluruh update ditolak Supabase.
      if (/stock\s*=\s*MAX\(\s*0\s*,\s*stock\s*-\s*\?\s*\)/i.test(sql)) {
        const qty = Number(params[0]) || 0;
        const id = params[params.length - 1];
        const { data } = await supabase.from(table).select('stock').eq('id', id).single();
        if (data) {
          await supabase.from(table)
            .update({ stock: Math.max(0, (Number(data.stock) || 0) - qty) })
            .eq('id', id);
        }
        return {};
      }

      // General UPDATE: SET col=?,col=? WHERE id=?
      const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/is);
      const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
      if (!setMatch || !whereMatch) return {};

      // Parser ini hanya paham `col = ?`. Ekspresi apa pun (fungsi, aritmatika)
      // akan salah-parse jadi kolom palsu dan menulis data yang keliru — tolak
      // dengan berisik daripada merusak data diam-diam.
      if (/[()]/.test(setMatch[1])) {
        throw new Error(`SupabaseDB: UPDATE dengan ekspresi belum didukung — ${sql}`);
      }

      const setCols = setMatch[1].split(',').map((c) => c.trim().split(/\s*=\s*/)[0].trim());
      const whereCol = whereMatch[1];
      const whereVal = params[params.length - 1];

      const obj: Record<string, any> = {};
      setCols.forEach((col, i) => { obj[col] = params[i] ?? null; });

      // Strip null values — prevents "column does not exist" errors for optional columns
      const updateObj = Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null));
      const { error } = await supabase.from(table).update(updateObj).eq(whereCol, whereVal);
      if (error) {
        if (LS_TABLES.has(table)) {
          lsUpdate(table, obj, whereCol, whereVal); // localStorage fallback
        } else {
          console.error('Supabase update:', error.message);
        }
      }

    } else if (upper.startsWith('DELETE')) {
      const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
      const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
      if (!tableMatch || !whereMatch) return {};

      const { error } = await supabase.from(tableMatch[1]).delete().eq(whereMatch[1], params[0]);
      if (error) console.error('Supabase delete:', error.message);
    }
    return {};
  }
}

export async function resetAllData(): Promise<void> {
  // Hapus dari Supabase di semua platform (native + web)
  const tables = [
    'po_items', 'purchase_orders', 'order_items', 'orders', 'bookings',
    'stock_movements', 'customers', 'ingredients', 'menus',
  ];
  for (const table of tables) {
    await supabase.from(table).delete().neq('id', '');
  }
  await supabase.from('categories').upsert([
    { id: 'cat-1', name: 'Makanan Berat' },
    { id: 'cat-2', name: 'Makanan Ringan' },
    { id: 'cat-3', name: 'Minuman' },
    { id: 'cat-4', name: 'Dessert' },
  ]);

  if (Platform.OS !== 'web') {
    // Hapus juga SQLite lokal di Android/iOS
    const db = await getDB();
    await db.execAsync(`
      DELETE FROM po_items;
      DELETE FROM purchase_orders;
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM bookings;
      DELETE FROM stock_movements;
      DELETE FROM customers;
      DELETE FROM ingredients;
      DELETE FROM menus;
      DELETE FROM categories;
      DELETE FROM staff;
      INSERT OR IGNORE INTO categories (id, name) VALUES
        ('cat-1','Makanan Berat'),('cat-2','Makanan Ringan'),
        ('cat-3','Minuman'),('cat-4','Dessert');
    `);
  } else {
    // Bersihkan localStorage fallback di web
    const lsTables = [
      'bookings', 'po_items', 'purchase_orders', 'order_items', 'orders',
      'stock_movements', 'customers', 'ingredients', 'menus',
    ];
    for (const t of lsTables) {
      try { localStorage.removeItem(`umkm_${t}`); } catch {}
    }
  }
}

function getTable(sql: string): string {
  const match = sql.match(/FROM\s+(\w+)/i);
  return match?.[1] ?? '';
}
