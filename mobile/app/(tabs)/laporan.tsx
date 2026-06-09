import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDB } from '../../lib/db';
import { formatRupiah } from '../../lib/hpp-calculator';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

type Period = 'hari' | 'minggu' | 'bulan' | 'tahun';

interface RevenuePoint { tanggal: string; revenue: number; jmlOrder: number }
interface TopMenu { name: string; qty: number; revenue: number }
interface OrderRow { id: string; tableNo: string; total: number; status: string; paymentMethod: string; createdAt: string }

const STATUS_COLOR: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Menunggu', color: Colors.amber,   bg: Colors.amberLight },
  proses:   { label: 'Diproses', color: Colors.info,    bg: Colors.infoLight  },
  selesai:  { label: 'Selesai',  color: Colors.primary, bg: Colors.primaryLight },
  batal:    { label: 'Batal',    color: Colors.danger,  bg: Colors.dangerLight  },
};

export default function LaporanScreen() {
  const [period, setPeriod] = useState<Period>('minggu');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [points, setPoints] = useState<RevenuePoint[]>([]);
  const [topMenus, setTopMenus] = useState<TopMenu[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalOrder, setTotalOrder] = useState(0);
  const [loading, setLoading] = useState(true);

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

      const rows = await db.getAllAsync<any>(
        `SELECT date(created_at) as tgl, COALESCE(SUM(total),0) as revenue, COUNT(*) as jml_order
         FROM orders WHERE status='selesai' AND date(created_at) BETWEEN ? AND ?
         GROUP BY tgl ORDER BY tgl`,
        startDate, endDate
      );
      setPoints(rows.map((r) => ({ tanggal: r.tgl, revenue: r.revenue, jmlOrder: r.jml_order })));

      const summary = rows.reduce((acc, r) => ({ rev: acc.rev + r.revenue, ord: acc.ord + r.jml_order }), { rev: 0, ord: 0 });
      setTotalRevenue(summary.rev);
      setTotalOrder(summary.ord);

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
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const db = await getDB();
    await db.runAsync(`UPDATE orders SET status = ? WHERE id = ?`, status, id);
    await loadData();
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

  const maxRevenue = Math.max(...points.map((p) => p.revenue), 1);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.periodRow}>
        {(['hari', 'minggu', 'bulan', 'tahun'] as Period[]).map((p) => (
          <TouchableOpacity key={p} style={[s.periodBtn, period === p && s.periodBtnActive]} onPress={() => setPeriod(p)}>
            <Text style={[s.periodText, period === p && s.periodTextActive]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
                          <TouchableOpacity style={s.actionBatal} onPress={() => confirmStatus(order.id, 'batal', 'Batal')}>
                            <Ionicons name="close" size={12} color={Colors.white} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 32 },
  periodRow: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.md, padding: 4, marginBottom: Spacing.md },
  periodBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm - 2 },
  periodBtnActive: { backgroundColor: Colors.primary },
  periodText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  periodTextActive: { color: Colors.white, fontWeight: '600' },
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
  orderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: Colors.border },
  orderTable: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  orderMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  orderTotal: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  badge: { borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  actionSelesai: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  actionBatal: { backgroundColor: Colors.danger, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 4 },
  actionText: { fontSize: 11, color: Colors.white, fontWeight: '600' },
});
