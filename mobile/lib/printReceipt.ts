import * as Print from 'expo-print';
import { formatRupiah } from './hpp-calculator';

export interface ReceiptData {
  orderId: string;
  items: Array<{ name: string; qty: number; price: number }>;
  tableNo: string;
  paymentMethod: string;
  subtotal: number;
  tax: number;
  ppn: number;
  discount: number;
  total: number;
  namaUsaha: string;
  alamat: string;
  noTelp: string;
  createdAt: string;
}

function buildHtml(d: ReceiptData): string {
  const itemRows = d.items
    .map(
      (item) => `
        <tr>
          <td class="item-name" colspan="2">${item.name}</td>
        </tr>
        <tr>
          <td class="item-qty">${item.qty} x ${formatRupiah(item.price)}</td>
          <td class="item-total">${formatRupiah(item.price * item.qty)}</td>
        </tr>`
    )
    .join('');

  const discountRow =
    d.discount > 0
      ? `<tr>
           <td class="sum-label">Diskon</td>
           <td class="sum-value" style="color:#1D9E75;">-${formatRupiah(d.discount)}</td>
         </tr>`
      : '';

  const tableNoRow = d.tableNo
    ? `<tr><td class="meta-label">Meja</td><td class="meta-value">${d.tableNo}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {
    size: 80mm auto;
    margin: 4mm 4mm;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Courier New', monospace;
    font-size: 11pt;
    color: #000;
    width: 72mm;
    background: #fff;
  }

  /* ── Layout helpers ── */
  table { width: 100%; border-collapse: collapse; }
  .dash  { border-top: 1px dashed #000; margin: 5px 0; }
  .solid { border-top: 2px solid  #000; margin: 5px 0; }

  /* ── Header ── */
  .hdr       { text-align: center; padding-bottom: 6px; }
  .hdr-name  { font-size: 14pt; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
  .hdr-sub   { font-size: 9pt;  color: #444; margin-top: 2px; line-height: 1.5; }

  /* ── Meta ── */
  .meta-label { font-size: 9pt; color: #444; padding: 1px 0; width: 45%; }
  .meta-value { font-size: 9pt; font-weight: 700; text-align: right; padding: 1px 0; }

  /* ── Section label ── */
  .section { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; color: #666; padding: 4px 0 3px; }

  /* ── Items ── */
  .item-name  { font-size: 11pt; font-weight: 700; padding: 4px 0 1px; }
  .item-qty   { font-size: 9pt;  color: #444; padding: 0 0 5px; }
  .item-total { font-size: 10pt; font-weight: 700; text-align: right; padding: 0 0 5px; }

  /* ── Summary ── */
  .sum-label { font-size: 10pt; color: #444; padding: 2px 0; }
  .sum-value { font-size: 10pt; text-align: right; padding: 2px 0; }
  .sum-total-label { font-size: 14pt; font-weight: 900; padding: 5px 0 3px; }
  .sum-total-value { font-size: 14pt; font-weight: 900; text-align: right; padding: 5px 0 3px; }

  /* ── Payment ── */
  .pay-label { font-size: 9pt;  color: #444; padding: 2px 0; }
  .pay-value { font-size: 9pt;  font-weight: 700; text-align: right; padding: 2px 0; }
  .pay-status { color: #1D9E75; }

  /* ── Footer ── */
  .footer { text-align: center; padding-top: 6px; font-size: 9pt; color: #555; line-height: 1.8; }
  .footer-thanks { font-size: 11pt; font-weight: 700; color: #000; }
</style>
</head>
<body>

  <!-- HEADER -->
  <div class="hdr">
    <div class="hdr-name">${d.namaUsaha}</div>
    ${d.alamat ? `<div class="hdr-sub">${d.alamat}</div>` : ''}
    ${d.noTelp ? `<div class="hdr-sub">Telp: ${d.noTelp}</div>` : ''}
  </div>

  <div class="solid"></div>

  <!-- ORDER META -->
  <table>
    <tr>
      <td class="meta-label">No. Order</td>
      <td class="meta-value">#${d.orderId}</td>
    </tr>
    <tr>
      <td class="meta-label">Tanggal</td>
      <td class="meta-value">${d.createdAt}</td>
    </tr>
    ${tableNoRow}
  </table>

  <div class="dash"></div>

  <!-- ITEMS -->
  <div class="section">Detail Pesanan</div>
  <table>
    ${itemRows}
  </table>

  <div class="solid"></div>

  <!-- SUMMARY -->
  <table>
    <tr>
      <td class="sum-label">Subtotal (${d.items.length} item)</td>
      <td class="sum-value">${formatRupiah(d.subtotal)}</td>
    </tr>
    <tr>
      <td class="sum-label">PPN ${d.ppn}%</td>
      <td class="sum-value">${formatRupiah(d.tax)}</td>
    </tr>
    ${discountRow}
    <tr>
      <td colspan="2"><div class="dash"></div></td>
    </tr>
    <tr>
      <td class="sum-total-label">TOTAL</td>
      <td class="sum-total-value">${formatRupiah(d.total)}</td>
    </tr>
  </table>

  <div class="dash"></div>

  <!-- PAYMENT -->
  <table>
    <tr>
      <td class="pay-label">Metode Bayar</td>
      <td class="pay-value">${d.paymentMethod}</td>
    </tr>
    <tr>
      <td class="pay-label">Status</td>
      <td class="pay-value pay-status">&#10003; Lunas</td>
    </tr>
  </table>

  <div class="solid"></div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-thanks">Terima kasih!</div>
    <div>Atas kepercayaan Anda berbelanja</div>
    <div>Simpan struk sebagai bukti bayar</div>
  </div>

</body>
</html>`;
}

export async function printReceipt(data: ReceiptData): Promise<void> {
  const html = buildHtml(data);
  await Print.printAsync({ html });
}
