import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { formatRupiah } from './hpp-calculator';
import { AUDIT_LABEL, IntegrityResult, describeAudit } from './audit';
import { PeriodSummary } from './reportData';

export interface ReportData {
  period: string;
  startDate: string;
  endDate: string;
  namaUsaha: string;
  summary: PeriodSummary;
  integrity?: IntegrityResult;
}

const PERIOD_LABEL: Record<string, string> = {
  hari: 'Hari Ini',
  minggu: '7 Hari Terakhir',
  bulan: 'Bulan Ini',
  tahun: 'Tahun Ini',
};

const auditTime = (iso: string) => (iso ?? '').slice(0, 16).replace('T', ' ');
// Nama menu, alasan, nama petugas diketik pengguna — escape sebelum masuk HTML (PDF dibuka di browser)
const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '-');

/** Baris ringkasan pemeriksaan — angka mentah (Excel) & teks (PDF). */
function checkRows(r?: IntegrityResult): Array<[string, number, string]> {
  if (!r) return [];
  return [
    ['Order dibatalkan', r.cancelled.count, `nilai ${formatRupiah(r.cancelled.total)}`],
    ['Dibatalkan setelah dibayar', r.cancelled.afterPaid, ''],
    ['Batal tanpa catatan', r.cancelledNoLog.length, ''],
    ['Total order tidak cocok dengan item', r.mismatched.length, ''],
    ['Order pakai diskon', r.discounted.count, `total ${formatRupiah(r.discounted.total)}`],
    ['Order hari sebelumnya belum selesai', r.stalePending.length, ''],
    ['PIN / login salah', r.pinFails, ''],
  ];
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

function table(head: string[], rows: string[][]): string {
  return `<table><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.length
    ? rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${head.length}" class="empty">Tidak ada data</td></tr>`}</table>`;
}

function buildHTML(data: ReportData): string {
  const label = PERIOD_LABEL[data.period] ?? data.period;
  const sm = data.summary;
  const r = data.integrity;
  const rp = formatRupiah;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 28px; color: #1a1a1a; font-size: 13px; }
    h1 { color: #1D9E75; margin: 0 0 4px; font-size: 22px; }
    .meta { color: #888; font-size: 12px; margin-bottom: 20px; }
    .summary { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
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
  <h1>Laporan ${esc(data.namaUsaha)}</h1>
  <p class="meta">Periode: ${label} &nbsp;|&nbsp; ${data.startDate} — ${data.endDate}</p>

  <div class="summary">
    <div class="card"><div class="card-val">${rp(sm.revenue)}</div><div class="card-lbl">Pendapatan Kotor</div></div>
    <div class="card"><div class="card-val">${rp(sm.laba)}</div><div class="card-lbl">Laba Bersih (${pct(sm.laba, sm.revenue)})</div></div>
    <div class="card"><div class="card-val">${sm.orderCount}</div><div class="card-lbl">Order Selesai</div></div>
    ${sm.orderCount > 0 ? `<div class="card"><div class="card-val">${rp(Math.round(sm.revenue / sm.orderCount))}</div><div class="card-lbl">Rata-rata per Order</div></div>` : ''}
  </div>

  <h2>Pendapatan Bersih</h2>
  <table>
    <tr><td>Pendapatan Kotor</td><td>${rp(sm.revenue)}</td></tr>
    <tr><td>− PPN</td><td>${rp(sm.tax)}</td></tr>
    <tr><td>− HPP (Modal)</td><td>${rp(sm.hpp)}</td></tr>
    <tr><td><b>Laba Bersih</b></td><td><b>${rp(sm.laba)}</b></td></tr>
  </table>

  <h2>Pendapatan Harian</h2>
  ${table(['Tanggal', 'Order', 'Pendapatan', 'PPN', 'HPP', 'Laba Bersih'],
    sm.daily.map((d) => [d.tanggal, String(d.orders), rp(d.revenue), rp(d.tax), rp(d.hpp), rp(d.laba)]))}

  <h2>Penjualan per Menu</h2>
  ${table(['#', 'Menu', 'Qty', 'Penjualan (sebelum PPN)', 'HPP', 'Laba Kotor'],
    sm.menuSales.map((m, i) => [String(i + 1), esc(m.name), String(m.qty), rp(m.sales), rp(m.hpp), rp(m.laba)]))}

  ${r ? `
  <h2>Pemeriksaan Data</h2>
  ${table(['Pemeriksaan', 'Jumlah', 'Keterangan'], checkRows(r).map(([k, n, ket]) => [k, String(n), ket]))}

  <h2>Penjualan per Petugas</h2>
  ${table(['Petugas', 'Order', 'Batal', 'Pendapatan'],
    r.byActor.map((a) => [esc(a.actor), String(a.orders), String(a.cancelled), rp(a.total)]))}` : ''}

  <h2>Daftar Order</h2>
  ${table(['ID', 'Waktu', 'Meja', 'Status', 'Bayar', 'Total', 'Petugas', 'Catatan'],
    sm.orders.map((o) => [o.id, o.waktu, esc(o.meja), o.status, esc(o.payment), rp(o.total), esc(o.petugas), o.catatan]))}

  ${r ? `
  <h2>Riwayat Perubahan</h2>
  ${table(['Waktu', 'Kejadian', 'Detail', 'Oleh'],
    r.changes.map((a) => [auditTime(a.created_at), esc(AUDIT_LABEL[a.action] ?? a.action), esc(describeAudit(a)), esc(a.actor || '-')]))}` : ''}

  <p class="footer">Diekspor oleh UMKM Pro · ${new Date().toLocaleString('id-ID')}</p>
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

// ─── Excel (.xlsx) ────────────────────────────────────────────────────────────
// Tampilan meniru PDF: judul, header hijau, baris zebra, format Rupiah, baris total —
// langsung rapi saat dibuka, tanpa perlu atur lebar kolom.

type ColType = 'text' | 'money' | 'int' | 'pct';
interface Col { header: string; width: number; type: ColType }
interface XTable {
  title?: string;
  cols: Col[];
  rows: any[][];
  total?: any[];        // baris TOTAL tebal di bawah tabel
  highlight?: number[]; // indeks baris yang ditonjolkan (mis. Laba Bersih)
  warnCol?: number;     // kolom angka yang merah bila > 0 (pemeriksaan)
}
export interface XSheet { name: string; subtitle: string; tables: XTable[] }

const txt = (header: string, width: number): Col => ({ header, width, type: 'text' });
const money = (header: string, width = 16): Col => ({ header, width, type: 'money' });
const int = (header: string, width = 9): Col => ({ header, width, type: 'int' });
const pctCol = (header: string, width = 10): Col => ({ header, width, type: 'pct' });
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

/** Isi workbook: satu sheet per bagian laporan. Angka tetap angka (bisa dijumlah/filter). */
export function buildSheets(data: ReportData): XSheet[] {
  const sm = data.summary;
  const r = data.integrity;
  const sub = `Periode ${PERIOD_LABEL[data.period] ?? data.period} · ${data.startDate} s/d ${data.endDate}`;

  const sheets: XSheet[] = [
    {
      name: 'Ringkasan',
      subtitle: `${sub} · diekspor ${new Date().toLocaleString('id-ID')}`,
      tables: [
        {
          title: 'Pendapatan Bersih',
          cols: [txt('Keterangan', 36), money('Nilai', 20)],
          rows: [
            ['Pendapatan Kotor', sm.revenue],
            ['− PPN', sm.tax],
            ['− HPP (Modal)', sm.hpp],
            ['Laba Bersih', sm.laba],
          ],
          highlight: [3],
        },
        {
          title: 'Kinerja',
          cols: [txt('Keterangan', 36), money('Nilai', 20)],
          rows: [
            ['Order Selesai', { v: sm.orderCount, type: 'int' }],
            ['Rata-rata per Order', sm.orderCount > 0 ? Math.round(sm.revenue / sm.orderCount) : 0],
            ['Margin Laba Bersih', { v: sm.revenue > 0 ? sm.laba / sm.revenue : 0, type: 'pct' }],
          ],
        },
        ...(r ? [{
          title: 'Pemeriksaan Data',
          cols: [txt('Pemeriksaan', 36), int('Jumlah', 20), txt('Keterangan', 28)],
          rows: checkRows(r),
          warnCol: 1,
        }] : []),
      ],
    },
    {
      name: 'Harian',
      subtitle: `${sub} · hanya order selesai`,
      tables: [{
        cols: [txt('Tanggal', 13), int('Order'), money('Pendapatan'), money('PPN', 14), money('HPP', 14), money('Laba Bersih')],
        rows: sm.daily.map((d) => [d.tanggal, d.orders, d.revenue, d.tax, d.hpp, d.laba]),
        total: ['TOTAL', sm.orderCount, sm.revenue, sm.tax, sm.hpp, sm.laba],
      }],
    },
    {
      name: 'Menu',
      subtitle: `${sub} · hanya order selesai`,
      tables: [{
        cols: [int('#', 5), txt('Menu', 28), int('Qty', 8), money('Penjualan (sebelum PPN)', 23), money('HPP', 14), money('Laba Kotor'), pctCol('Margin')],
        rows: sm.menuSales.map((m, i) => [i + 1, m.name, m.qty, m.sales, m.hpp, m.laba, m.sales > 0 ? m.laba / m.sales : 0]),
        total: ['', 'TOTAL', sum(sm.menuSales, (m) => m.qty), sum(sm.menuSales, (m) => m.sales),
          sum(sm.menuSales, (m) => m.hpp), sum(sm.menuSales, (m) => m.laba), ''],
      }],
    },
    {
      name: 'Order',
      subtitle: `${sub} · semua status`,
      tables: [{
        cols: [txt('ID', 9), txt('Waktu', 17), txt('Meja', 7), txt('Status', 11), txt('Pembayaran', 13),
          money('Subtotal', 14), money('PPN', 12), money('Diskon', 12), money('Total', 14), txt('Petugas', 24), txt('Catatan', 16)],
        rows: sm.orders.map((o) => [o.id, o.waktu, o.meja, o.status, o.payment, o.subtotal, o.tax, o.discount, o.total, o.petugas, o.catatan]),
      }],
    },
  ];

  if (r) {
    sheets.push(
      {
        name: 'Petugas',
        subtitle: sub,
        tables: [{
          cols: [txt('Petugas', 30), int('Order'), int('Batal'), money('Pendapatan', 18)],
          rows: r.byActor.map((a) => [a.actor, a.orders, a.cancelled, a.total]),
          total: ['TOTAL', sum(r.byActor, (a) => a.orders), sum(r.byActor, (a) => a.cancelled), sum(r.byActor, (a) => a.total)],
        }],
      },
      {
        name: 'Riwayat Perubahan',
        subtitle: sub,
        tables: [{
          cols: [txt('Waktu', 17), txt('Kejadian', 24), txt('Detail', 60), txt('Oleh', 26)],
          rows: r.changes.map((a) => [auditTime(a.created_at), AUDIT_LABEL[a.action] ?? a.action, describeAudit(a), a.actor || '-']),
        }],
      },
    );
  }
  return sheets;
}

// Warna sama dengan PDF
const C = { green: '1D9E75', light: 'F0FAF6', zebra: 'F7F9F8', line: 'E3E7E5', muted: '888888', red: 'E24B4A', white: 'FFFFFF', ink: '1A1A1A' };
const FMT: Record<ColType, string | undefined> = {
  text: undefined,
  money: '"Rp "#,##0;[Red]-"Rp "#,##0', // rugi otomatis merah
  int: '#,##0',
  pct: '0.0%',
};
const thin = (rgb: string) => ({ style: 'thin', color: { rgb } });
const solid = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });

/** Susun satu worksheet bergaya dari XSheet. */
export function renderSheet(XLSX: any, sheet: XSheet, namaUsaha: string): any {
  const ws: any = {};
  const merges: any[] = [];
  const rowsMeta: any[] = [];
  const nCols = Math.max(...sheet.tables.map((t) => t.cols.length));
  const put = (r: number, c: number, cell: any) => { ws[XLSX.utils.encode_cell({ r, c })] = cell; };

  // Judul + subjudul, digabung selebar tabel
  put(0, 0, { v: `${namaUsaha} — ${sheet.name}`, t: 's', s: { font: { bold: true, sz: 16, color: { rgb: C.green } } } });
  put(1, 0, { v: sheet.subtitle, t: 's', s: { font: { sz: 10, italic: true, color: { rgb: C.muted } } } });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: nCols - 1 } });
  rowsMeta[0] = { hpt: 26 };

  let r = 3;
  for (const t of sheet.tables) {
    if (t.title) {
      put(r, 0, { v: t.title.toUpperCase(), t: 's', s: { font: { bold: true, sz: 11, color: { rgb: C.green } } } });
      r++;
    }

    // Header hijau, teks putih
    const headerRow = r;
    t.cols.forEach((col, c) => put(r, c, {
      v: col.header, t: 's',
      s: {
        font: { bold: true, color: { rgb: C.white } },
        fill: solid(C.green),
        alignment: { vertical: 'center', horizontal: col.type === 'text' ? 'left' : 'right', wrapText: true },
        border: { top: thin(C.green), bottom: thin(C.green), left: thin(C.green), right: thin(C.green) },
      },
    }));
    rowsMeta[r] = { hpt: 22 };
    r++;

    if (t.rows.length === 0) {
      put(r, 0, { v: 'Tidak ada data', t: 's', s: { font: { italic: true, color: { rgb: C.muted } } } });
      merges.push({ s: { r, c: 0 }, e: { r, c: t.cols.length - 1 } });
      r += 2;
      continue;
    }

    const body = t.total ? [...t.rows, t.total] : t.rows;
    body.forEach((row, i) => {
      const isTotal = !!t.total && i === body.length - 1;
      const isHighlight = !!t.highlight?.includes(i);
      t.cols.forEach((col, c) => {
        const raw = row[c];
        // Sel boleh menimpa tipe kolom lewat { v, type } (tabel Kinerja)
        const boxed = raw !== null && typeof raw === 'object';
        const type: ColType = boxed ? raw.type : col.type;
        const v = boxed ? raw.v : raw;
        const isNum = typeof v === 'number';
        const warn = t.warnCol === c && isNum && v > 0;
        put(r, c, {
          v: v ?? '', t: isNum ? 'n' : 's',
          ...(isNum && FMT[type] ? { z: FMT[type] } : {}),
          s: {
            font: { bold: isTotal || isHighlight || warn, color: { rgb: warn ? C.red : isHighlight ? C.green : C.ink } },
            ...(isTotal || isHighlight ? { fill: solid(C.light) } : i % 2 === 1 ? { fill: solid(C.zebra) } : {}),
            alignment: { vertical: 'center', horizontal: type === 'text' ? 'left' : 'right', wrapText: col.width >= 40 },
            border: { bottom: thin(C.line), ...(isTotal ? { top: thin(C.green) } : {}) },
          },
        });
      });
      rowsMeta[r] = { hpt: 18 };
      r++;
    });

    // Filter otomatis di header untuk tabel data (bukan tabel ringkasan berjudul)
    if (!t.title && t.rows.length > 1) {
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + t.rows.length, c: t.cols.length - 1 } }) };
    }
    r++; // spasi antar tabel
  }

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r - 1, 1), c: nCols - 1 } });
  ws['!merges'] = merges;
  ws['!rows'] = rowsMeta;
  ws['!cols'] = Array.from({ length: nCols }, (_, c) => ({
    wch: Math.max(...sheet.tables.map((t) => t.cols[c]?.width ?? 0)),
  }));
  return ws;
}

export async function exportToExcel(data: ReportData): Promise<void> {
  const XLSX = await import('xlsx-js-style');
  const wb = XLSX.utils.book_new();
  for (const sh of buildSheets(data)) {
    XLSX.utils.book_append_sheet(wb, renderSheet(XLSX, sh, data.namaUsaha), sh.name);
  }

  const filename = `laporan-${data.period}-${data.startDate}.xlsx`;

  if (Platform.OS === 'web') {
    XLSX.writeFile(wb, filename);
    return;
  }

  const Sharing = await import('expo-sharing');
  const path = (FileSystem.documentDirectory ?? '') + filename;
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(path, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Export Laporan Excel',
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  });
}
