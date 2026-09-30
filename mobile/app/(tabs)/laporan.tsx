import { useEffect, useState } from 'react';
import OwnerOnly from '../../components/OwnerOnly';
import CancelOrderModal from '../../components/CancelOrderModal';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDB } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { formatRupiah } from '../../lib/hpp-calculator';
import { exportToPDF, exportToExcel, ReportData } from '../../lib/exportReport';
import { PeriodSummary, summarizePeriod } from '../../lib/reportData';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  AUDIT_LABEL, AuditRow, IntegrityResult, checkIntegrity, describeAudit, hasOwnerPin,
} from '../../lib/audit';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

type Period = 'hari' | 'minggu' | 'bulan' | 'tahun';

interface RevenuePoint { tanggal: string; revenue: number; jmlOrder: number }
interface TopMenu { name: string; qty: number; revenue: number }
interface OrderRow { id: string; tableNo: string; total: number; status: string; paymentMethod: string; createdAt: string }
interface PayBreakdown { method: string; count: number; total: number }

const STATUS_COLOR: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Menunggu', color: Colors.amber,   bg: Colors.amberLight },
  proses:   { label: 'Diproses', color: Colors.info,    bg: Colors.infoLight  },
  selesai:  { label: 'Selesai',  color: Colors.primary, bg: Colors.primaryLight },
  batal:    { label: 'Batal',    color: Colors.danger,  bg: Colors.dangerLight  },
};

export default function LaporanScreenGuarded() {
  return <OwnerOnly><LaporanScreen /></OwnerOnly>;
}

function LaporanScreen() {
  const { namaUsaha } = useSettingsStore();
  const [period, setPeriod] = useState<Period>('minggu');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [points, setPoints] = useState<RevenuePoint[]>([]);
  const [topMenus, setTopMenus] = useState<TopMenu[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalOrder, setTotalOrder] = useState(0);
  const [totalTax, setTotalTax] = useState(0);
  const [totalHpp, setTotalHpp] = useState(0);
  const [payBreakdown, setPayBreakdown] = useState<PayBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  const [summary, setSummary] = useState<PeriodSummary | null>(null); // data export (semua order periode)

  // ── Pembatalan order ──────────────────────────────────────────────────────
  const [cancelTarget, setCancelTarget] = useState<OrderRow | null>(null);

  useEffect(() => { loadData(); }, [period]);

  async function loadData() {
    setLoading(true);
    try {
      const db = await getDB();
      const now = new Date();
      let startDate: string;
      const endDate = now.toISOString().slice(0, 10);

      if (period === 'hari') {
        startDate = endDate;
      } else if (period === 'minggu') {
        const d = new Date(now); d.setDate(d.getDate() - 6);
        startDate = d.toISOString().slice(0, 10);
      } else if (period === 'bulan') {
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      } else {
        startDate = `${now.getFullYear()}-01-01`;
      }
      setDateRange({ start: startDate, end: endDate });

      const rows = await db.getAllAsync<any>(
        `SELECT date(created_at) as tgl, COALESCE(SUM(total),0) as revenue, COALESCE(SUM(tax),0) as tax, COUNT(*) as jml_order
         FROM orders WHERE status='selesai' AND date(created_at) BETWEEN ? AND ?
         GROUP BY tgl ORDER BY tgl`,
        startDate, endDate
      );
      setPoints(rows.map((r) => ({ tanggal: r.tgl, revenue: r.revenue, jmlOrder: r.jml_order })));

      const summary = rows.reduce((acc, r) => ({ rev: acc.rev + r.revenue, tax: acc.tax + (r.tax ?? 0), ord: acc.ord + r.jml_order }), { rev: 0, tax: 0, ord: 0 });
      setTotalRevenue(summary.rev);
      setTotalTax(summary.tax);
      setTotalOrder(summary.ord);

      // HPP saat terjual (oi.hpp); order lama sebelum kolom ini ada → HPP menu sekarang
      const hppRows = await db.getAllAsync<any>(
        `SELECT COALESCE(SUM(oi.qty * COALESCE(oi.hpp, m.hpp)),0) as hpp
         FROM order_items oi
         JOIN menus m ON m.id = oi.menu_id
         JOIN orders o ON o.id = oi.order_id
         WHERE o.status='selesai' AND date(o.created_at) BETWEEN ? AND ?`,
        startDate, endDate
      );
      setTotalHpp(hppRows[0]?.hpp ?? 0);

      const menuRows = await db.getAllAsync<any>(
        `SELECT m.name, SUM(oi.qty) as qty, SUM(oi.subtotal) as revenue
         FROM order_items oi
         JOIN menus m ON m.id = oi.menu_id
         JOIN orders o ON o.id = oi.order_id
         WHERE o.status='selesai' AND date(o.created_at) BETWEEN ? AND ?
         GROUP BY oi.menu_id ORDER BY qty DESC LIMIT 5`,
        startDate, endDate
      );
      setTopMenus(menuRows.map((r) => ({ name: r.name, qty: r.qty, revenue: r.revenue })));

      const orderRows = await db.getAllAsync<any>(
        `SELECT id, table_no, total, status, payment_method, created_at FROM orders ORDER BY created_at DESC LIMIT 50`
      );
      setOrders(orderRows.map((r) => ({
        id: r.id, tableNo: r.table_no, total: r.total, status: r.status,
        paymentMethod: r.payment_method, createdAt: r.created_at ?? '',
      })));

      const payRows = await db.getAllAsync<any>(
        `SELECT payment_method, COUNT(*) as count, SUM(total) as total
         FROM orders WHERE status='selesai' AND date(created_at) BETWEEN ? AND ?
         GROUP BY payment_method ORDER BY total DESC`,
        startDate, endDate
      );
      setPayBreakdown(payRows.map((r) => ({
        method: r.payment_method || 'Tidak diketahui',
        count: r.count,
        total: r.total,
      })));

      // Query polos tanpa agregat → jalan sama di SQLite, server HP, dan Supabase.
      // ponytail: scan semua order/item tiap buka laporan; filter periode di SQL kalau data sudah puluhan ribu
      const [allOrders, allItems, audits, menus] = await Promise.all([
        db.getAllAsync<any>('SELECT * FROM orders'),
        db.getAllAsync<any>('SELECT * FROM order_items'),
        db.getAllAsync<AuditRow>('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 5000').catch(() => []),
        db.getAllAsync<any>('SELECT * FROM menus'),
      ]);
      const check = checkIntegrity({
        orders: allOrders, items: allItems, audits, menus,
        start: startDate, end: endDate, today: endDate,
      });
      setIntegrity(check);
      setSummary(summarizePeriod({
        orders: allOrders, items: allItems, menus, start: startDate, end: endDate,
        creatorOf: check.creatorOf, changed: check.changedOrderIds,
        flagged: new Set([...check.mismatched, ...check.cancelledNoLog]),
      }));
    } finally {
      setLoading(false);
    }
  }

  function buildReportData(): ReportData {
    if (!summary) throw new Error('Data laporan belum siap, coba lagi');
    return {
      period,
      startDate: dateRange.start,
      endDate: dateRange.end,
      namaUsaha: namaUsaha || 'UMKM Pro',
      summary,
      integrity: integrity ?? undefined,
    };
  }

  async function handleExport(type: 'pdf' | 'excel') {
    setShowExportMenu(false);
    setExporting(true);
    try {
      const data = buildReportData();
      if (type === 'pdf') {
        await exportToPDF(data);
      } else {
        await exportToExcel(data);
      }
    } catch (e: any) {
      Alert.alert('Gagal Export', e?.message ?? 'Terjadi kesalahan saat mengekspor laporan.');
    } finally {
      setExporting(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const db = await getDB();
    await db.runAsync(`UPDATE orders SET status = ?, synced = 0 WHERE id = ?`, status, id);
    await loadData();
    supabase.from('orders').update({ status }).eq('id', id)
      .then(({ error }) => {
        if (!error) db.runAsync('UPDATE orders SET synced = 1 WHERE id = ?', id).catch(() => {});
      })
      .catch(() => {});
  }

  function confirmStatus(id: string, status: string, label: string) {
    if (Platform.OS === 'web') {
      if ((window as any).confirm(`Ubah order ke ${label}?`)) updateStatus(id, status);
      return;
    }
    Alert.alert(`Ubah ke ${label}?`, undefined, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Ya', onPress: () => updateStatus(id, status) },
    ]);
  }

  const netIncome = totalRevenue - totalTax - totalHpp;
  const maxRevenue = Math.max(...points.map((p) => p.revenue), 1);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.topRow}>
        <View style={s.periodRow}>
          {(['hari', 'minggu', 'bulan', 'tahun'] as Period[]).map((p) => (
            <TouchableOpacity key={p} style={[s.periodBtn, period === p && s.periodBtnActive]} onPress={() => setPeriod(p)}>
              <Text style={[s.periodText, period === p && s.periodTextActive]}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[s.exportBtn, exporting && { opacity: 0.5 }]}
          onPress={() => setShowExportMenu(true)}
          disabled={exporting || loading}
        >
          {exporting
            ? <ActivityIndicator size={14} color={Colors.white} />
            : <Ionicons name="download-outline" size={16} color={Colors.white} />
          }
          <Text style={s.exportBtnText}>Export</Text>
        </TouchableOpacity>
      </View>

      {/* Modal pilihan format export */}
      <Modal visible={showExportMenu} transparent animationType="fade">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowExportMenu(false)}>
          <View style={s.exportSheet}>
            <Text style={s.exportSheetTitle}>Export Laporan</Text>
            <TouchableOpacity style={s.exportOption} onPress={() => handleExport('pdf')}>
              <View style={[s.exportIcon, { backgroundColor: '#FFE8E8' }]}>
                <Ionicons name="document-text" size={20} color="#E24B4A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.exportOptionTitle}>Export PDF</Text>
                <Text style={s.exportOptionDesc}>Laporan siap cetak dalam format PDF</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={s.exportOption} onPress={() => handleExport('excel')}>
              <View style={[s.exportIcon, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="grid" size={20} color="#2E7D32" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.exportOptionTitle}>Export Excel (.xlsx)</Text>
                <Text style={s.exportOptionDesc}>Ringkasan, harian, menu, order, petugas & riwayat — per sheet</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={s.exportCancel} onPress={() => setShowExportMenu(false)}>
              <Text style={s.exportCancelText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={s.summaryRow}>
            <View style={s.summaryCard}>
              <Text style={s.summaryValue}>{formatRupiah(totalRevenue)}</Text>
              <Text style={s.summaryLabel}>Total Pendapatan</Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={s.summaryValue}>{totalOrder}</Text>
              <Text style={s.summaryLabel}>Total Order</Text>
            </View>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Pendapatan Bersih</Text>
            <View style={s.netRow}><Text style={s.netLabel}>Pendapatan Kotor</Text><Text style={s.netValue}>{formatRupiah(totalRevenue)}</Text></View>
            <View style={s.netRow}><Text style={s.netLabel}>− PPN</Text><Text style={s.netValue}>{formatRupiah(totalTax)}</Text></View>
            <View style={s.netRow}><Text style={s.netLabel}>− HPP (Modal)</Text><Text style={s.netValue}>{formatRupiah(totalHpp)}</Text></View>
            <View style={[s.netRow, s.netTotalRow]}>
              <Text style={s.netTotalLabel}>Laba Bersih</Text>
              <Text style={[s.netTotalValue, netIncome < 0 && { color: Colors.danger }]}>{formatRupiah(netIncome)}</Text>
            </View>
            {totalRevenue > 0 && (
              <Text style={s.netMargin}>Margin {Math.round((netIncome / totalRevenue) * 100)}% dari pendapatan kotor</Text>
            )}
          </View>

          {integrity && <IntegrityCard r={integrity} pinSet={hasOwnerPin()} />}

          {points.length > 0 && (
            <View style={s.chartCard}>
              <Text style={s.cardTitle}>Grafik Pendapatan</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={s.chart}>
                  {points.map((p) => (
                    <View key={p.tanggal} style={s.barCol}>
                      <View style={s.barWrapper}>
                        <View style={[s.bar, { height: Math.max((p.revenue / maxRevenue) * 100, 4) }]} />
                      </View>
                      <Text style={s.barLabel}>{p.tanggal.slice(5)}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          <View style={s.card}>
            <Text style={s.cardTitle}>Menu Terlaris</Text>
            {topMenus.length === 0 ? (
              <Text style={s.empty}>Belum ada data</Text>
            ) : (
              topMenus.map((m, idx) => (
                <View key={m.name} style={s.menuRow}>
                  <View style={s.rankBadge}>
                    <Text style={s.rankText}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.menuName}>{m.name}</Text>
                    <Text style={s.menuQty}>{m.qty} terjual</Text>
                  </View>
                  <Text style={s.menuRevenue}>{formatRupiah(m.revenue)}</Text>
                </View>
              ))
            )}
          </View>

          {payBreakdown.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Metode Pembayaran</Text>
              {payBreakdown.map((p) => (
                <View key={p.method} style={s.payRow}>
                  <View style={s.payLeft}>
                    <Text style={s.payMethod}>{p.method}</Text>
                    <Text style={s.payCount}>{p.count} transaksi</Text>
                  </View>
                  <View style={s.payRight}>
                    <Text style={s.payTotal}>{formatRupiah(p.total)}</Text>
                    <Text style={s.payPct}>
                      {totalRevenue > 0 ? `${Math.round((p.total / totalRevenue) * 100)}%` : '-'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={s.card}>
            <Text style={s.cardTitle}>Manajemen Order</Text>
            {orders.length === 0 ? (
              <Text style={s.empty}>Belum ada order</Text>
            ) : (
              orders.map((order, idx) => {
                const cfg = STATUS_COLOR[order.status] ?? { label: order.status, color: Colors.textMuted, bg: Colors.background };
                return (
                  <View key={order.id} style={[s.orderRow, idx === 0 && { borderTopWidth: 0 }]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={s.orderTable}>Meja {order.tableNo || '-'}</Text>
                        <View style={[s.badge, { backgroundColor: cfg.bg }]}>
                          <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                        {integrity?.changedOrderIds.has(order.id) && (
                          <View style={[s.badge, { backgroundColor: Colors.amberLight }]}>
                            <Text style={[s.badgeText, { color: Colors.amber }]}>Diubah</Text>
                          </View>
                        )}
                        {(integrity?.mismatched.includes(order.id) || integrity?.cancelledNoLog.includes(order.id)) && (
                          <View style={[s.badge, { backgroundColor: Colors.dangerLight }]}>
                            <Text style={[s.badgeText, { color: Colors.danger }]}>⚠ Tidak sesuai</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.orderMeta}>{(order.createdAt).slice(0, 16).replace('T', ' ')} · {order.paymentMethod || '-'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={s.orderTotal}>{formatRupiah(order.total)}</Text>
                      {order.status !== 'selesai' && order.status !== 'batal' && (
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          <TouchableOpacity style={s.actionSelesai} onPress={() => confirmStatus(order.id, 'selesai', 'Selesai')}>
                            <Ionicons name="checkmark" size={12} color={Colors.white} />
                            <Text style={s.actionText}>Selesai</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.actionBatal} onPress={() => setCancelTarget(order)}>
                            <Ionicons name="close" size={12} color={Colors.white} />
                          </TouchableOpacity>
                        </View>
                      )}
                      {order.status === 'selesai' && (
                        <TouchableOpacity onPress={() => setCancelTarget(order)}>
                          <Text style={s.cancelPaidLink}>Batalkan</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
          {integrity && integrity.byActor.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Penjualan per Petugas</Text>
              {integrity.byActor.map((a) => (
                <View key={a.actor} style={s.payRow}>
                  <View style={s.payLeft}>
                    <Text style={s.payMethod}>{a.actor}</Text>
                    <Text style={s.payCount}>
                      {a.orders} order{a.cancelled ? ` · ${a.cancelled} batal` : ''}
                    </Text>
                  </View>
                  <Text style={s.payTotal}>{formatRupiah(a.total)}</Text>
                </View>
              ))}
            </View>
          )}

          {integrity && integrity.changes.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Riwayat Perubahan</Text>
              {integrity.changes.slice(0, 30).map((a, idx) => (
                <View key={a.id} style={[s.auditRow, idx === 0 && { borderTopWidth: 0 }]}>
                  <Text style={s.auditTitle}>{AUDIT_LABEL[a.action] ?? a.action}</Text>
                  {!!describeAudit(a) && <Text style={s.auditDetail}>{describeAudit(a)}</Text>}
                  <Text style={s.auditMeta}>{fmtTime(a.created_at)} · {a.actor || '-'}</Text>
                </View>
              ))}
              {integrity.changes.length > 30 && (
                <Text style={s.empty}>+{integrity.changes.length - 30} lainnya — lihat di Export</Text>
              )}
            </View>
          )}
        </>
      )}

      <CancelOrderModal
        order={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onDone={() => { setCancelTarget(null); loadData(); }}
      />
    </ScrollView>
  );
}

function fmtTime(iso: string) {
  return (iso ?? '').slice(0, 16).replace('T', ' ');
}

/** Ringkasan hal yang perlu dicek owner dalam periode ini. */
function IntegrityCard({ r, pinSet }: { r: IntegrityResult; pinSet: boolean }) {
  const lines: Array<{ level: 'danger' | 'warn'; text: string }> = [];
  if (!pinSet) lines.push({ level: 'danger', text: 'PIN owner belum diatur — order yang sudah dibayar bisa dibatalkan siapa saja. Atur di Dashboard → Pengaturan.' });
  if (r.cancelledNoLog.length) lines.push({ level: 'danger', text: `${r.cancelledNoLog.length} order batal tanpa catatan alasan/petugas` });
  if (r.mismatched.length) lines.push({ level: 'danger', text: `${r.mismatched.length} order dengan total tidak cocok dengan item-nya` });
  if (r.cancelled.afterPaid) lines.push({ level: 'danger', text: `${r.cancelled.afterPaid} order dibatalkan setelah dibayar` });
  if (r.pinFails) lines.push({ level: 'danger', text: `${r.pinFails}x percobaan PIN owner salah` });
  if (r.cancelled.count) lines.push({ level: 'warn', text: `${r.cancelled.count} order dibatalkan, nilai ${formatRupiah(r.cancelled.total)}` });
  if (r.discounted.count) lines.push({ level: 'warn', text: `${r.discounted.count} order pakai diskon, total ${formatRupiah(r.discounted.total)}` });
  if (r.stalePending.length) lines.push({ level: 'warn', text: `${r.stalePending.length} order dari hari sebelumnya belum selesai / belum dibayar` });
  if (r.menusBelowHpp.length) lines.push({ level: 'warn', text: `Harga jual di bawah HPP: ${r.menusBelowHpp.join(', ')}` });
  if (r.menusNoHpp.length) lines.push({ level: 'warn', text: `HPP belum diisi (laba bersih tidak akurat): ${r.menusNoHpp.join(', ')}` });
  const edits = r.changes.filter((a) => ['menu_ubah', 'stok_manual', 'pengaturan_ubah', 'reset_data'].includes(a.action)).length;
  if (edits) lines.push({ level: 'warn', text: `${edits} perubahan harga/stok/pengaturan — lihat Riwayat Perubahan` });

  return (
    <View style={[s.card, lines.some((l) => l.level === 'danger') && { borderWidth: 1, borderColor: Colors.danger }]}>
      <Text style={s.cardTitle}>Perlu Dicek</Text>
      {lines.length === 0 ? (
        <View style={s.checkRow}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
          <Text style={s.checkText}>Semua data sesuai, tidak ada yang janggal</Text>
        </View>
      ) : lines.map((l) => (
        <View key={l.text} style={s.checkRow}>
          <Ionicons
            name={l.level === 'danger' ? 'alert-circle' : 'information-circle'}
            size={16}
            color={l.level === 'danger' ? Colors.danger : Colors.amber}
          />
          <Text style={s.checkText}>{l.text}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 32 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  periodRow: { flex: 1, flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.md, padding: 4 },
  periodBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm - 2 },
  periodBtnActive: { backgroundColor: Colors.primary },
  periodText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  periodTextActive: { color: Colors.white, fontWeight: '600' },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primary, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  exportBtnText: { color: Colors.white, fontSize: FontSize.sm, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  exportSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.md, paddingBottom: 32,
  },
  exportSheetTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  exportOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderTopWidth: 0.5, borderTopColor: Colors.border,
  },
  exportIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  exportOptionTitle: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary },
  exportOptionDesc: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  exportCancel: {
    marginTop: Spacing.md, paddingVertical: 12,
    borderRadius: Radius.sm, backgroundColor: Colors.background,
    alignItems: 'center',
  },
  exportCancelText: { fontSize: FontSize.base, color: Colors.textSecondary, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  summaryCard: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, elevation: 1 },
  summaryValue: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.primary },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  chartCard: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md, elevation: 1 },
  cardTitle: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.sm },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, paddingBottom: 20 },
  barCol: { alignItems: 'center', marginHorizontal: 4, width: 32 },
  barWrapper: { height: 100, justifyContent: 'flex-end' },
  bar: { width: 20, backgroundColor: Colors.primary, borderRadius: 4 },
  barLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 4, textAlign: 'center' },
  card: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md, elevation: 1 },
  empty: { textAlign: 'center', color: Colors.textMuted, paddingVertical: Spacing.sm },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: Colors.border },
  rankBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: Spacing.sm },
  rankText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  menuName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  menuQty: { fontSize: FontSize.xs, color: Colors.textMuted },
  menuRevenue: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  netLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  netValue: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '600' },
  netTotalRow: { borderTopWidth: 0.5, borderTopColor: Colors.border, marginTop: 4, paddingTop: 10 },
  netTotalLabel: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  netTotalValue: { fontSize: FontSize.base, fontWeight: '800', color: Colors.primary },
  netMargin: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4, textAlign: 'right' },
  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: Colors.border },
  payLeft: { flex: 1 },
  payMethod: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  payCount: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  payRight: { alignItems: 'flex-end' },
  payTotal: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  payPct: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600', marginTop: 1 },
  orderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: Colors.border },
  orderTable: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  orderMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  orderTotal: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  badge: { borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  actionSelesai: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  actionBatal: { backgroundColor: Colors.danger, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 4 },
  cancelPaidLink: { fontSize: 11, color: Colors.danger, fontWeight: '600', textDecorationLine: 'underline' },
  checkRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 5 },
  checkText: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary },
  auditRow: { paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: Colors.border },
  auditTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  auditDetail: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  auditMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  actionText: { fontSize: 11, color: Colors.white, fontWeight: '600' },
});
