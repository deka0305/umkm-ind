// Self-check logika pemeriksaan data (lib/audit.ts) tanpa emulator.
// Jalankan: node scripts/check-audit.js
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '../lib/audit.ts'), 'utf8');
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } });

let session = { name: 'Budi', role: 'kasir' };

// DB palsu: cukup untuk alur cancelOrder / logAudit
const fake = {
  orders: { o1: { id: 'o1', status: 'selesai', total: 30000 }, o2: { id: 'o2', status: 'pending', total: 5000 } },
  items: [{ order_id: 'o1', menu_id: 'm1', qty: 2 }, { order_id: 'o2', menu_id: 'm1', qty: 1 }],
  menus: { m1: { id: 'm1', stock: 3 } },
  staff: { s1: { id: 's1', name: 'Budi', pin: '5555', active: 1 }, s2: { id: 's2', name: 'Lama', pin: '1111', active: 0 } },
  audit: [],
};
const db = {
  async getFirstAsync(sql, id) {
    if (/FROM orders/.test(sql)) return fake.orders[id] ?? null;
    if (/FROM menus/.test(sql)) return fake.menus[id] ?? null;
    if (/FROM staff/.test(sql)) return fake.staff[id] ?? null;
  },
  async getAllAsync(sql, id) { return fake.items.filter((i) => i.order_id === id); },
  async runAsync(sql, ...p) {
    if (/^UPDATE menus/.test(sql)) fake.menus[p[p.length - 1]].stock = p[0];
    else if (/^UPDATE orders/.test(sql)) fake.orders[p[p.length - 1]].status = p[0];
    else if (/^INSERT INTO audit_log/.test(sql)) fake.audit.push({ action: p[1], entity_id: p[3], detail: JSON.parse(p[4]) });
  },
};

const stubs = {
  'react-native': { Platform: { OS: 'android' } },
  '../stores/sessionStore': { useSessionStore: { getState: () => ({ petugas: session }) } },
  './db': { isPhoneClient: () => false, isLocalDB: () => true, getDB: async () => db, generateId: () => 'id' + Math.random() },
  './sync': { notifyDataChange() {} },
  '../stores/settingsStore': { useSettingsStore: { getState: () => ({ ownerPin: '1234' }) } },
};
const m = new Module('audit');
m.require = (id) => stubs[id];
m._compile(outputText, 'audit.js');
const { checkIntegrity, diffFields } = m.exports;

const orders = [
  { id: 'ok', status: 'selesai', subtotal: 100, tax: 11, discount: 0, total: 111, created_at: '2026-09-30T01:00:00Z' },
  { id: 'batal-resmi', status: 'batal', subtotal: 50, tax: 0, discount: 0, total: 50, created_at: '2026-09-30T02:00:00Z' },
  { id: 'batal-liar', status: 'batal', subtotal: 20, tax: 0, discount: 0, total: 20, created_at: '2026-09-30T03:00:00Z' },
  { id: 'diubah-total', status: 'selesai', subtotal: 100, tax: 0, discount: 0, total: 60, created_at: '2026-09-30T04:00:00Z' },
  { id: 'diskon', status: 'selesai', subtotal: 30, tax: 0, discount: 5, total: 25, created_at: '2026-09-30T05:00:00Z' },
  { id: 'nyangkut', status: 'pending', subtotal: 10, tax: 0, discount: 0, total: 10, created_at: '2026-09-28T05:00:00Z' },
  { id: 'luar-periode', status: 'batal', subtotal: 10, tax: 0, discount: 0, total: 10, created_at: '2026-08-01T00:00:00Z' },
];
const items = [
  { order_id: 'ok', subtotal: 100 }, { order_id: 'batal-resmi', subtotal: 50 }, { order_id: 'batal-liar', subtotal: 20 },
  { order_id: 'diubah-total', subtotal: 100 }, { order_id: 'diskon', subtotal: 30 }, { order_id: 'nyangkut', subtotal: 10 },
  { order_id: 'luar-periode', subtotal: 10 },
];
const audits = [
  { id: '1', action: 'order_batal', entity: 'order', entity_id: 'batal-resmi', detail: '{"prevStatus":"selesai"}', actor: 'A', created_at: '2026-09-30T02:10:00Z' },
  { id: '2', action: 'pin_salah', entity: 'pengaturan', entity_id: '', detail: '{}', actor: 'B', created_at: '2026-09-30T02:20:00Z' },
  { id: '3', action: 'pin_salah', entity: 'pengaturan', entity_id: '', detail: '{}', actor: 'B', created_at: '2026-07-01T00:00:00Z' },
  { id: '4', action: 'order_baru', entity: 'order', entity_id: 'ok', detail: '{}', actor: 'Budi · HP Utama', created_at: '2026-09-30T01:00:00Z' },
  { id: '5', action: 'order_baru', entity: 'order', entity_id: 'diskon', detail: '{}', actor: 'Budi · HP Utama', created_at: '2026-09-30T05:00:00Z' },
  { id: '6', action: 'order_baru', entity: 'order', entity_id: 'batal-resmi', detail: '{}', actor: 'Sari · Perangkat Staf', created_at: '2026-09-30T02:00:00Z' },
  { id: '7', action: 'login', entity: 'petugas', entity_id: 's1', detail: '{}', actor: 'Budi · HP Utama', created_at: '2026-09-30T00:00:00Z' },
  { id: '8', action: 'login_gagal', entity: 'petugas', entity_id: 's1', detail: '{}', actor: 'Budi · HP Utama', created_at: '2026-09-30T00:01:00Z' },
];
const menus = [
  { name: 'Rugi', is_active: 1, sell_price: 5000, hpp: 6000 },
  { name: 'TanpaHpp', is_active: 1, sell_price: 5000, hpp: 0 },
  { name: 'Nonaktif', is_active: 0, sell_price: 1, hpp: 9 },
  { name: 'Normal', is_active: 1, sell_price: 9000, hpp: 4000 },
];

const r = checkIntegrity({ orders, items, audits, menus, start: '2026-09-24', end: '2026-09-30', today: '2026-09-30' });
assert.deepStrictEqual(r.cancelled, { count: 2, total: 70, afterPaid: 1 });
assert.deepStrictEqual(r.cancelledNoLog, ['batal-liar']);
assert.deepStrictEqual(r.mismatched, ['diubah-total']);
assert.deepStrictEqual(r.discounted, { count: 1, total: 5 });
assert.deepStrictEqual(r.stalePending, ['nyangkut']);
assert.deepStrictEqual(r.menusBelowHpp, ['Rugi']);
assert.deepStrictEqual(r.menusNoHpp, ['TanpaHpp']);
assert.strictEqual(r.pinFails, 2);                                        // PIN owner + login petugas salah
assert.deepStrictEqual(r.changes.map((a) => a.id), ['2', '1', '8']);       // order_baru & login tidak ikut
assert.ok(r.changedOrderIds.has('batal-resmi'));
assert.ok(!r.changedOrderIds.has('ok'));                                   // order biasa tidak ditandai "Diubah"
const who = Object.fromEntries(r.byActor.map((a) => [a.actor, a]));
assert.deepStrictEqual(who['Budi · HP Utama'], { actor: 'Budi · HP Utama', orders: 2, total: 136, cancelled: 0 });
assert.deepStrictEqual(who['Sari · Perangkat Staf'], { actor: 'Sari · Perangkat Staf', orders: 0, total: 0, cancelled: 1 });
assert.strictEqual(who['Tidak tercatat'].cancelled, 1);                   // batal-liar

assert.deepStrictEqual(diffFields({ a: 1, b: 2 }, { a: 1, b: 3 }, ['a', 'b']), { b: [2, 3] });

(async () => {
  const { cancelOrder } = m.exports;
  const rejects = (p, msg) => assert.rejects(p, (e) => e.message.includes(msg));

  await rejects(cancelOrder('o1', { reason: '' }), 'Alasan');                  // alasan wajib
  await rejects(cancelOrder('o1', { reason: 'salah input', pin: '0000' }), 'PIN'); // order selesai + PIN salah
  assert.strictEqual(fake.orders.o1.status, 'selesai');
  assert.strictEqual(fake.menus.m1.stock, 3);                                  // stok tidak berubah saat ditolak
  assert.strictEqual(fake.audit.at(-1).action, 'pin_salah');                   // PIN salah tercatat

  await cancelOrder('o1', { reason: 'salah input', pin: '1234' });
  assert.strictEqual(fake.orders.o1.status, 'batal');
  assert.strictEqual(fake.menus.m1.stock, 5);                                  // 3 + 2 dikembalikan
  const log = fake.audit.at(-1);
  assert.deepStrictEqual([log.action, log.entity_id, log.detail.prevStatus, log.detail.reason], ['order_batal', 'o1', 'selesai', 'salah input']);

  await rejects(cancelOrder('o1', { reason: 'lagi', pin: '1234' }), 'sudah dibatalkan'); // stok tidak dobel
  assert.strictEqual(fake.menus.m1.stock, 5);

  await rejects(cancelOrder('o2', { reason: 'pelanggan pergi' }), 'PIN');     // kasir: order belum bayar pun wajib PIN
  session = { name: 'Owner', role: 'owner' };
  await cancelOrder('o2', { reason: 'pelanggan pergi' });                     // owner: order belum bayar tanpa PIN
  assert.strictEqual(fake.menus.m1.stock, 6);
  session = { name: 'Budi', role: 'kasir' };

  // Login petugas
  const { checkStaffLoginLocal } = m.exports;
  assert.deepStrictEqual(await checkStaffLoginLocal('s1', '5555'), { ok: true, name: 'Budi' });
  assert.strictEqual((await checkStaffLoginLocal('s2', '1111')).ok, false);  // nonaktif
  assert.deepStrictEqual(await checkStaffLoginLocal('owner', '1234'), { ok: true, name: 'Owner' });
  for (let i = 0; i < 5; i++) assert.strictEqual((await checkStaffLoginLocal('s1', '0000')).ok, false);
  assert.strictEqual(fake.audit.at(-1).action, 'login_gagal');
  const locked = await checkStaffLoginLocal('s1', '5555');                   // PIN benar tapi terkunci
  assert.ok(!locked.ok && locked.error.includes('Terlalu banyak'));

  console.log('✓ check-audit: semua pemeriksaan lolos');
})().catch((e) => { console.error(e); process.exit(1); });
