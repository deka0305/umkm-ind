// Self-check ringkasan laporan (lib/reportData.ts) + export Excel sungguhan (lib/exportReport.ts).
// Jalankan: node scripts/check-report.js  → juga menulis contoh .xlsx ke folder temp
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const assert = require('assert');

function load(file, stubs) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } });
  const m = new Module(file);
  m.require = (id) => (id in stubs ? stubs[id] : require(id));
  m._compile(outputText, file);
  return m.exports;
}

const { summarizePeriod } = load('lib/reportData.ts', {});

const menus = [{ id: 'm1', name: 'Nasi Goreng', hpp: 9000 }, { id: 'm2', name: 'Es Teh', hpp: 1500 }];
const orders = [
  { id: 'a1', status: 'selesai', subtotal: 41000, tax: 4510, discount: 0, total: 45510, table_no: '1', payment_method: 'Tunai', created_at: '2026-09-29T02:00:00Z' },
  { id: 'a2', status: 'selesai', subtotal: 20000, tax: 2200, discount: 2000, total: 20200, table_no: '2', payment_method: 'QRIS', created_at: '2026-09-30T03:00:00Z' },
  { id: 'a3', status: 'batal', subtotal: 18000, tax: 0, discount: 0, total: 18000, table_no: '3', payment_method: 'Tunai', created_at: '2026-09-30T04:00:00Z' },
  { id: 'a4', status: 'pending', subtotal: 5000, tax: 0, discount: 0, total: 5000, table_no: '4', payment_method: 'Tunai', created_at: '2026-09-30T05:00:00Z' },
  { id: 'luar', status: 'selesai', subtotal: 99999, tax: 0, discount: 0, total: 99999, table_no: '9', payment_method: 'Tunai', created_at: '2026-08-01T00:00:00Z' },
];
const items = [
  { order_id: 'a1', menu_id: 'm1', qty: 2, subtotal: 36000, hpp: 8000 },  // HPP saat terjual 8rb (menu sekarang 9rb)
  { order_id: 'a1', menu_id: 'm2', qty: 1, subtotal: 5000 },              // order lama tanpa snapshot → 1.5rb
  { order_id: 'a2', menu_id: 'm1', qty: 1, subtotal: 18000, hpp: 9000 },
  { order_id: 'a2', menu_id: 'm2', qty: 1, subtotal: 2000, hpp: 1500 },
  { order_id: 'a3', menu_id: 'm1', qty: 1, subtotal: 18000, hpp: 9000 },   // batal → tidak dihitung
  { order_id: 'luar', menu_id: 'm1', qty: 5, subtotal: 99999, hpp: 1 },
];

const sm = summarizePeriod({
  orders, items, menus, start: '2026-09-24', end: '2026-09-30',
  creatorOf: { a1: 'Budi · HP Utama' }, changed: new Set(['a3']), flagged: new Set(['a2']),
});
assert.strictEqual(sm.revenue, 45510 + 20200);
assert.strictEqual(sm.tax, 4510 + 2200);
assert.strictEqual(sm.hpp, 16000 + 1500 + 9000 + 1500);
assert.strictEqual(sm.laba, sm.revenue - sm.tax - sm.hpp);
assert.strictEqual(sm.orderCount, 2);
assert.deepStrictEqual(sm.daily.map((d) => [d.tanggal, d.orders, d.laba]), [
  ['2026-09-29', 1, 45510 - 4510 - 17500],
  ['2026-09-30', 1, 20200 - 2200 - 10500],
]);
assert.deepStrictEqual(sm.menuSales.map((m) => [m.name, m.qty, m.sales, m.hpp]), [
  ['Nasi Goreng', 3, 54000, 25000],
  ['Es Teh', 2, 7000, 3000],
]);
assert.deepStrictEqual(sm.orders.map((o) => o.id), ['A4', 'A3', 'A2', 'A1']);   // semua order periode, terbaru dulu
assert.strictEqual(sm.orders.find((o) => o.id === 'A1').petugas, 'Budi · HP Utama');
assert.strictEqual(sm.orders.find((o) => o.id === 'A3').catatan, 'Diubah');
assert.strictEqual(sm.orders.find((o) => o.id === 'A2').catatan, 'Tidak sesuai');

// ── Export Excel sungguhan (jalur web: XLSX.writeFile ke disk) ───────────────
const out = path.join(require('os').tmpdir(), 'umkm-contoh-laporan.xlsx');
const { exportToExcel, buildSheets } = load('lib/exportReport.ts', {
  'react-native': { Platform: { OS: 'web' } },
  'expo-file-system': {},
  './hpp-calculator': { formatRupiah: (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID') },
  './audit': {
    AUDIT_LABEL: { order_batal: 'Order dibatalkan' },
    describeAudit: (a) => 'alasan: salah input',
  },
  './reportData': {},
});
const integrity = {
  cancelled: { count: 1, total: 18000, afterPaid: 0 }, cancelledNoLog: [], mismatched: ['a2'],
  discounted: { count: 1, total: 2000 }, stalePending: [], pinFails: 0,
  byActor: [{ actor: 'Budi · HP Utama', orders: 1, total: 45510, cancelled: 0 }],
  changes: [{ id: 'x', action: 'order_batal', created_at: '2026-09-30T04:10:00Z', actor: 'Budi · HP Utama', detail: '{}' }],
};
const data = { period: 'minggu', startDate: '2026-09-24', endDate: '2026-09-30', namaUsaha: 'Warung Contoh', summary: sm, integrity };
assert.deepStrictEqual(buildSheets(data).map((s) => s.name), ['Ringkasan', 'Harian', 'Menu', 'Order', 'Petugas', 'Riwayat Perubahan']);

const XLSX = require('xlsx-js-style');
const realWrite = XLSX.writeFile;
XLSX.writeFile = (wb) => realWrite(wb, out); // node: tulis ke scripts/ alih-alih cwd
exportToExcel(data).then(() => {
  const wb = XLSX.readFile(out, { cellNF: true });
  assert.deepStrictEqual(wb.SheetNames, ['Ringkasan', 'Harian', 'Menu', 'Order', 'Petugas', 'Riwayat Perubahan']);
  const ring = wb.Sheets['Ringkasan'];
  assert.strictEqual(ring.B9.v, sm.laba);          // Laba Bersih sebagai angka
  assert.ok(ring.B9.z.includes('Rp'));             // format Rupiah
  assert.strictEqual(ring.B15.z, '0.0%');          // margin sebagai persen
  assert.strictEqual(wb.Sheets['Order'].I5.v, 5000); // baris data pertama di bawah judul + header
  console.log('✓ check-report: ringkasan & export Excel lolos →', out);
}).catch((e) => { console.error(e); process.exit(1); });
