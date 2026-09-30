// Ringkasan laporan per periode — satu sumber angka untuk PDF & Excel.
// Pure function (tanpa DB/React Native) supaya mudah dicek: scripts/check-audit.js.

export interface DailyRow { tanggal: string; orders: number; revenue: number; tax: number; hpp: number; laba: number }
export interface MenuSalesRow { name: string; qty: number; sales: number; hpp: number; laba: number }
export interface OrderExportRow {
  id: string; waktu: string; meja: string; status: string; payment: string;
  subtotal: number; tax: number; discount: number; total: number; petugas: string; catatan: string;
}
export interface PeriodSummary {
  revenue: number; tax: number; hpp: number; laba: number; orderCount: number;
  daily: DailyRow[]; menuSales: MenuSalesRow[]; orders: OrderExportRow[];
}

const STATUS_LABEL: Record<string, string> = { pending: 'Menunggu', proses: 'Diproses', selesai: 'Selesai', batal: 'Batal' };

export function summarizePeriod(input: {
  orders: any[]; items: any[]; menus: any[]; start: string; end: string;
  creatorOf?: Record<string, string>; changed?: Set<string>; flagged?: Set<string>;
}): PeriodSummary {
  const { orders, items, menus, start, end } = input;
  const inRange = (o: any) => { const d = (o.created_at ?? '').slice(0, 10); return d >= start && d <= end; };
  const num = (v: any) => Number(v) || 0;

  const menuById: Record<string, any> = {};
  for (const m of menus) menuById[m.id] = m;
  // HPP saat terjual (oi.hpp); order lama tanpa snapshot → HPP menu sekarang (sama dengan query layar)
  const hppOf = (it: any) => num(it.qty) * (it.hpp ?? num(menuById[it.menu_id]?.hpp));

  const period = orders.filter(inRange);
  const paid = period.filter((o) => o.status === 'selesai');
  const paidIds = new Set(paid.map((o) => o.id));

  const itemsByOrder: Record<string, any[]> = {};
  for (const it of items) (itemsByOrder[it.order_id] ??= []).push(it);

  const daily: Record<string, DailyRow> = {};
  for (const o of paid) {
    const tgl = (o.created_at ?? '').slice(0, 10);
    const d = (daily[tgl] ??= { tanggal: tgl, orders: 0, revenue: 0, tax: 0, hpp: 0, laba: 0 });
    d.orders++;
    d.revenue += num(o.total);
    d.tax += num(o.tax);
    d.hpp += (itemsByOrder[o.id] ?? []).reduce((s, it) => s + hppOf(it), 0);
  }
  for (const d of Object.values(daily)) d.laba = d.revenue - d.tax - d.hpp;

  const menuSales: Record<string, MenuSalesRow> = {};
  for (const it of items) {
    if (!paidIds.has(it.order_id)) continue;
    const m = (menuSales[it.menu_id] ??= { name: menuById[it.menu_id]?.name ?? 'Menu terhapus', qty: 0, sales: 0, hpp: 0, laba: 0 });
    m.qty += num(it.qty);
    m.sales += num(it.subtotal);
    m.hpp += hppOf(it);
  }
  for (const m of Object.values(menuSales)) m.laba = m.sales - m.hpp;

  const dailyRows = Object.values(daily).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  const total = (k: keyof DailyRow) => dailyRows.reduce((s, d) => s + (d[k] as number), 0);

  return {
    revenue: total('revenue'), tax: total('tax'), hpp: total('hpp'), laba: total('laba'),
    orderCount: paid.length,
    daily: dailyRows,
    menuSales: Object.values(menuSales).sort((a, b) => b.qty - a.qty),
    orders: [...period]
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      .map((o) => ({
        id: String(o.id).slice(-6).toUpperCase(),
        waktu: (o.created_at ?? '').slice(0, 16).replace('T', ' '),
        meja: o.table_no || '-',
        status: STATUS_LABEL[o.status] ?? o.status,
        payment: o.payment_method || '-',
        subtotal: num(o.subtotal), tax: num(o.tax), discount: num(o.discount), total: num(o.total),
        petugas: input.creatorOf?.[o.id] ?? '-',
        catatan: [input.changed?.has(o.id) && 'Diubah', input.flagged?.has(o.id) && 'Tidak sesuai']
          .filter(Boolean).join(', '),
      })),
  };
}
