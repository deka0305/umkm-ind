// Self-check sinkronisasi item order (lib/sync.ts) dengan Supabase & SQLite tiruan.
// Jalankan: node scripts/check-sync.js
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const assert = require('assert');

// ── SQLite tiruan: cukup untuk query yang dipakai sync.ts ──────────────────
const local = {
  orders: [
    { id: 'offline1', status: 'selesai', total: 10, synced: 0 },   // dibuat saat offline
    { id: 'lama1', status: 'selesai', total: 20, synced: 1 },      // "synced" tapi item tak pernah terkirim (bug lama)
  ],
  order_items: [
    { id: 'i1', order_id: 'offline1', menu_id: 'm1', qty: 1, price: 10, subtotal: 10, hpp: 4 },
    { id: 'i2', order_id: 'lama1', menu_id: 'm1', qty: 2, price: 10, subtotal: 20, hpp: 4 },
  ],
};
const db = {
  async getAllAsync(sql, ...p) {
    if (/FROM orders WHERE synced = 0/.test(sql)) return local.orders.filter((o) => o.synced === 0).map((o) => ({ ...o }));
    if (/SELECT id FROM orders WHERE synced = 1/.test(sql)) return local.orders.filter((o) => o.synced === 1).map((o) => ({ id: o.id }));
    if (/FROM order_items WHERE order_id IN/.test(sql)) {
      assert.ok(!/\bhpp\b/.test(sql), 'hpp tidak boleh dikirim ke Supabase');
      return local.order_items.filter((i) => p.includes(i.order_id))
        .map(({ id, order_id, menu_id, qty, price, subtotal }) => ({ id, order_id, menu_id, qty, price, subtotal }));
    }
    return [];
  },
  async getFirstAsync() { return null; },
  async runAsync(sql, ...p) {
    if (/UPDATE orders SET synced = 1/.test(sql)) local.orders.find((o) => o.id === p[0]).synced = 1;
    if (/INSERT OR IGNORE INTO order_items/.test(sql) && !local.order_items.some((i) => i.id === p[0])) {
      local.order_items.push({ id: p[0], order_id: p[1], menu_id: p[2], qty: p[3], price: p[4], subtotal: p[5], hpp: null });
    }
  },
};

// ── Supabase tiruan ────────────────────────────────────────────────────────
const cloud = { orders: {}, order_items: {} };
let failItems = false;
const supabase = {
  from(table) {
    const q = {
      _in: null,
      async upsert(rows) {
        if (table === 'order_items' && failItems) return { error: { message: 'boom' } };
        for (const r of [].concat(rows)) (cloud[table] ??= {})[r.id] = r;
        return { error: null };
      },
      select() { return q; },
      in(col, ids) { q._in = [col, ids]; return q; },
      then(res) {
        const rows = Object.values(cloud[table] ?? {}).filter((r) => !q._in || q._in[1].includes(r[q._in[0]]));
        return Promise.resolve({ data: rows, error: null }).then(res);
      },
    };
    return q;
  },
};

const store = {};
const stubs = {
  'react-native': { Platform: { OS: 'android' } },
  './db': { getDB: async () => db },
  './supabase': { supabase },
  './networkUtils': { checkInternetConnection: async () => true },
  '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async (k) => store[k] ?? null, setItem: async (k, v) => { store[k] = v; } } },
};
const src = fs.readFileSync(path.join(__dirname, '../lib/sync.ts'), 'utf8');
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } });
const m = new Module('sync');
m.require = (id) => stubs[id];
m._compile(outputText, 'sync.js');
const { syncPendingOrders, backfillOrderItemsOnce } = m.exports;

(async () => {
  // 1. Item gagal terkirim → order TIDAK ditandai synced (akan dicoba lagi)
  failItems = true;
  await syncPendingOrders();
  assert.strictEqual(local.orders[0].synced, 0);
  assert.ok(cloud.orders.offline1, 'order tetap terkirim');

  // 2. Supabase pulih → order + item terkirim, baru ditandai synced
  failItems = false;
  await syncPendingOrders();
  assert.strictEqual(local.orders[0].synced, 1);
  assert.deepStrictEqual(Object.keys(cloud.order_items), ['i1']);
  assert.ok(!('hpp' in cloud.order_items.i1));

  // 3. Backfill sekali: item order lama yang "hilang" ikut terkirim
  await backfillOrderItemsOnce();
  assert.deepStrictEqual(Object.keys(cloud.order_items).sort(), ['i1', 'i2']);
  cloud.order_items = {};
  await backfillOrderItemsOnce();                          // kedua kali: tidak jalan lagi
  assert.deepStrictEqual(Object.keys(cloud.order_items), []);

  console.log('✓ check-sync: item order tersinkron (offline, gagal-ulang, backfill)');
})().catch((e) => { console.error(e); process.exit(1); });
