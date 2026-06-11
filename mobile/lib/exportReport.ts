import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { formatRupiah } from './hpp-calculator';

export interface ReportData {
  period: string;
  startDate: string;
  endDate: string;
  totalRevenue: number;
  totalOrder: number;
  namaUsaha: string;
  points: Array<{ tanggal: string; revenue: number; jmlOrder: number }>;
  topMenus: Array<{ name: string; qty: number; revenue: number }>;
  orders: Array<{ id: string; tableNo: string; total: number; status: string; paymentMethod: string; createdAt: string }>;
}

const PERIOD_LABEL: Record<string, string> = {
  hari: 'Hari Ini',
  minggu: '7 Hari Terakhir',
  bulan: 'Bulan Ini',
  tahun: 'Tahun Ini',
};

// ─── PDF ──────────────────────────────────────────────────────────────────────

function buildHTML(data: ReportData): string {
  const label = PERIOD_LABEL[data.period] ?? data.period;

  const revenueRows = data.points.length
    ? data.points.map((p) => `<tr><td>${p.tanggal}</td><td>${formatRupiah(p.revenue)}</td><td>${p.jmlOrder}</td></tr>`).join('')
    : `<tr><td colspan="3" class="empty">Tidak ada data</td></tr>`;

  const menuRows = data.topMenus.length
    ? data.topMenus.map((m, i) => `<tr><td>${i + 1}</td><td>${m.name}</td><td>${m.qty}</td><td>${formatRupiah(m.revenue)}</td></tr>`).join('')
    : `<tr><td colspan="4" class="empty">Tidak ada data</td></tr>`;

  const orderRows = data.orders.length
    ? data.orders.map((o) => `
        <tr>
          <td>${o.id.slice(0, 8).toUpperCase()}</td>
          <td>${o.tableNo || '-'}</td>
          <td>${formatRupiah(o.total)}</td>
          <td>${o.status}</td>
          <td>${o.paymentMethod || '-'}</td>
          <td>${o.createdAt.slice(0, 16).replace('T', ' ')}</td>
        </tr>`).join('')
    : `<tr><td colspan="6" class="empty">Tidak ada data</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 28px; color: #1a1a1a; font-size: 13px; }
    h1 { color: #1D9E75; margin: 0 0 4px; font-size: 22px; }
    .meta { color: #888; font-size: 12px; margin-bottom: 20px; }
    .summary { display: flex; gap: 12px; margin-bottom: 24px; }
    .card { background: #f0faf6; border-radius: 8px; padding: 12px 18px; }
    .card-val { font-size: 18px; font-weight: bold; color: #1D9E75; }
    .card-lbl { font-size: 11px; color: #888; margin-top: 2px; }
    h2 { font-size: 13px; font-weight: 700; color: #1D9E75; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th { background: #1D9E75; color: white; padding: 7px 10px; text-align: left; font-size: 12px; }
    td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 12px; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .empty { text-align: center; color: #aaa; padding: 12px; }
    .footer { margin-top: 32px; font-size: 11px; color: #aaa; text-align: right; }
  </style>
</head>
<body>
  <h1>Laporan ${data.namaUsaha}</h1>
  <p class="meta">Periode: ${label} &nbsp;|&nbsp; ${data.startDate} — ${data.endDate}</p>

  <div class="summary">
    <div class="card">
      <div class="card-val">${formatRupiah(data.totalRevenue)}</div>
      <div class="card-lbl">Total Pendapatan</div>
    </div>
    <div class="card">
      <div class="card-val">${data.totalOrder}</div>
      <div class="card-lbl">Total Order Selesai</div>
    </div>
    ${data.totalOrder > 0 ? `<div class="card">
      <div class="card-val">${formatRupiah(Math.round(data.totalRevenue / data.totalOrder))}</div>
      <div class="card-lbl">Rata-rata per Order</div>
    </div>` : ''}
  </div>

  <h2>Pendapatan Harian</h2>
  <table>
    <tr><th>Tanggal</th><th>Pendapatan</th><th>Jumlah Order</th></tr>
    ${revenueRows}
  </table>

  <h2>Menu Terlaris</h2>
  <table>
    <tr><th>#</th><th>Menu</th><th>Qty Terjual</th><th>Revenue</th></tr>
    ${menuRows}
  </table>

  <h2>Daftar Order</h2>
  <table>
    <tr><th>ID</th><th>Meja</th><th>Total</th><th>Status</th><th>Pembayaran</th><th>Waktu</th></tr>
    ${orderRows}
  </table>

  <p class="footer">Diekspor oleh UMKM Pro</p>
</body>
</html>`;
}

export async function exportToPDF(data: ReportData): Promise<void> {
  const html = buildHTML(data);

  if (Platform.OS === 'web') {
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
    return;
  }

  const Print = await import('expo-print');
  const Sharing = await import('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Export Laporan PDF',
    UTI: 'com.adobe.pdf',
  });
}

// ─── Excel (CSV) ──────────────────────────────────────────────────────────────

function escCSV(val: any): string {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function toCSV(rows: any[][]): string {
  return rows.map((r) => r.map(escCSV).join(',')).join('\r\n');
}

export async function exportToExcel(data: ReportData): Promise<void> {
  const label = PERIOD_LABEL[data.period] ?? data.period;

  const rows: any[][] = [
    [`Laporan ${data.namaUsaha}`],
    ['Periode', label, `${data.startDate} - ${data.endDate}`],
    ['Total Pendapatan', data.totalRevenue],
    ['Total Order Selesai', data.totalOrder],
    [],
    ['PENDAPATAN HARIAN'],
    ['Tanggal', 'Pendapatan (Rp)', 'Jumlah Order'],
    ...data.points.map((p) => [p.tanggal, p.revenue, p.jmlOrder]),
    [],
    ['MENU TERLARIS'],
    ['#', 'Menu', 'Qty Terjual', 'Revenue (Rp)'],
    ...data.topMenus.map((m, i) => [i + 1, m.name, m.qty, m.revenue]),
    [],
    ['DAFTAR ORDER'],
    ['ID', 'Meja', 'Total (Rp)', 'Status', 'Pembayaran', 'Waktu'],
    ...data.orders.map((o) => [
      o.id.slice(0, 8).toUpperCase(),
      o.tableNo || '-',
      o.total,
      o.status,
      o.paymentMethod || '-',
      o.createdAt.slice(0, 16).replace('T', ' '),
    ]),
  ];

  const csv = '﻿' + toCSV(rows); // BOM agar Excel baca UTF-8 dengan benar
  const filename = `laporan-${data.period}-${data.startDate}.csv`;

  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const Sharing = await import('expo-sharing');
  const path = (FileSystem.documentDirectory ?? '') + filename;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(path, {
    mimeType: 'text/csv',
    dialogTitle: 'Export Laporan Excel',
  });
}
