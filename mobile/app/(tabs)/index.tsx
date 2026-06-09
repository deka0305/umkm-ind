import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getDB } from '../../lib/db';
import { getStokStatus } from '../../stores/stokStore';
import { formatRupiah } from '../../lib/hpp-calculator';
import { useSettingsStore } from '../../stores/settingsStore';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

interface DashboardData {
  totalOrder: number;
  pendapatan: number;
  orderPending: number;
  stokKritis: Array<{ id: string; name: string; currentStock: number; unit: string; minStock: number }>;
  orderTerbaru: Array<{ id: string; tableNo: string; total: number; status: string; createdAt: string }>;
  topMenu: Array<{ name: string; qty: number }>;
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pending:  { label: 'Menunggu', color: Colors.amber,   bg: Colors.amberLight,   icon: 'time-outline'          },
  proses:   { label: 'Diproses', color: Colors.info,    bg: Colors.infoLight,    icon: 'sync-outline'          },
  selesai:  { label: 'Selesai',  color: Colors.primary, bg: Colors.primaryLight, icon: 'checkmark-circle-outline' },
  batal:    { label: 'Batal',    color: Colors.danger,  bg: Colors.dangerLight,  icon: 'close-circle-outline'  },
};

const QUICK_ACTIONS = [
  { label: 'Order Baru',  icon: 'add-circle',  route: '/order/cart',    color: Colors.white,  bg: Colors.primary },
  { label: 'Booking',     icon: 'calendar',    route: '/order/booking', color: Colors.info,   bg: Colors.infoLight },
  { label: 'Beli Stok',  icon: 'cube',         route: '/po',            color: Colors.amber,  bg: Colors.amberLight },
] as const;

function todayStr() {
  return new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function DashboardScreen() {
  const router = useRouter();
  const { ppn, namaUsaha, save: saveSettings } = useSettingsStore();
  const [data, setData] = useState<DashboardData>({
    totalOrder: 0, pendapatan: 0, orderPending: 0, stokKritis: [], orderTerbaru: [], topMenu: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [formPpn, setFormPpn] = useState(String(ppn));
  const [formNama, setFormNama] = useState(namaUsaha);

  function openSettings() {
    setFormPpn(String(ppn));
    setFormNama(namaUsaha);
    setShowSettings(true);
  }

  function handleSaveSettings() {
    const parsed = parseFloat(formPpn.replace(',', '.'));
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      Alert.alert('PPN tidak valid', 'Masukkan angka antara 0 – 100');
      return;
    }
    saveSettings({ ppn: parsed, namaUsaha: formNama.trim() || 'UMKM Pro' });
    setShowSettings(false);
  }

  const loadData = useCallback(async () => {
    try {
      const db = await getDB();
      const todayIso = new Date().toISOString().slice(0, 10);

      const [summary, stokRows, orderRows, pendingRow] = await Promise.all([
        db.getFirstAsync<{ cnt: number; rev: number }>(
          `SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as rev FROM orders WHERE status='selesai' AND date(created_at)=?`,
          todayIso
        ),
        db.getAllAsync<any>(
          `SELECT id, name, current_stock, unit, min_stock FROM ingredients WHERE current_stock <= min_stock ORDER BY current_stock ASC LIMIT 5`
        ),
        db.getAllAsync<any>(
          `SELECT id, table_no, total, status, created_at FROM orders ORDER BY created_at DESC LIMIT 8`
        ),
        db.getFirstAsync<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM orders WHERE status='pending'`
        ),
      ]);

      setData({
        totalOrder: summary?.cnt ?? 0,
        pendapatan: summary?.rev ?? 0,
        orderPending: pendingRow?.cnt ?? 0,
        stokKritis: stokRows.map((r) => ({
          id: r.id, name: r.name,
          currentStock: r.current_stock, unit: r.unit, minStock: r.min_stock,
        })),
        orderTerbaru: orderRows.map((r) => ({
          id: r.id, tableNo: r.table_no, total: r.total, status: r.status, createdAt: r.created_at,
        })),
        topMenu: [],
      });
    } catch (e) {
      console.error('loadData error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, []);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={s.loadingText}>Memuat data...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />}
    >
      {/* ── Header Banner ─────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={s.headerLogo}>
            <Ionicons name="storefront" size={22} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>UMKM Pro</Text>
            <Text style={s.headerDate}>{todayStr()}</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={loadData}>
            <Ionicons name="refresh-outline" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={s.refreshBtn} onPress={openSettings}>
            <Ionicons name="settings-outline" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Stats cards */}
        <View style={s.statsRow}>
          <View style={[s.statCard, { backgroundColor: Colors.primary }]}>
            <Text style={s.statNumWhite}>{data.totalOrder}</Text>
            <Text style={s.statDescWhite}>Order Selesai</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: Colors.white }]}>
            <Text style={[s.statNum, { color: Colors.textPrimary }]}>{formatRupiah(data.pendapatan)}</Text>
            <Text style={s.statDesc}>Pendapatan Hari Ini</Text>
          </View>
        </View>
      </View>

      {/* ── Quick Actions ──────────────────────────────── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Aksi Cepat</Text>
        <View style={s.actionsRow}>
          {QUICK_ACTIONS.map((a) => (
            <TouchableOpacity
              key={a.route}
              style={[s.actionBtn, { backgroundColor: a.bg }]}
              onPress={() => router.push(a.route as any)}
            >
              <View style={[s.actionIconWrap, { backgroundColor: a.color === Colors.white ? Colors.primary : a.color + '20' }]}>
                <Ionicons
                  name={a.icon as any}
                  size={22}
                  color={a.color === Colors.white ? Colors.white : a.color}
                />
              </View>
              <Text style={[s.actionLabel, { color: a.color === Colors.white ? Colors.white : a.color }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Metric Cards ──────────────────────────────── */}
      <View style={s.metricsRow}>
        <MetricCard
          icon="alert-circle"
          iconColor={data.stokKritis.length > 0 ? Colors.danger : Colors.primary}
          label="Stok Kritis"
          value={String(data.stokKritis.length)}
          sub={data.stokKritis.length > 0 ? 'Perlu perhatian' : 'Semua aman'}
          bg={data.stokKritis.length > 0 ? Colors.dangerLight : Colors.primaryLight}
          onPress={() => router.push('/(tabs)/stok')}
        />
        <MetricCard
          icon="time"
          iconColor={data.orderPending > 0 ? Colors.amber : Colors.textMuted}
          label="Menunggu"
          value={String(data.orderPending)}
          sub={data.orderPending > 0 ? 'Proses segera' : 'Tidak ada'}
          bg={data.orderPending > 0 ? Colors.amberLight : Colors.background}
          onPress={() => router.push('/(tabs)/laporan')}
        />
      </View>

      {/* ── Stok Kritis ───────────────────────────────── */}
      {data.stokKritis.length > 0 && (
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={s.cardTitleRow}>
              <View style={[s.dot, { backgroundColor: Colors.danger }]} />
              <Text style={s.cardTitle}>Stok Kritis</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/stok')}>
              <Text style={s.seeAll}>Kelola →</Text>
            </TouchableOpacity>
          </View>
          {data.stokKritis.map((item) => {
            const status = getStokStatus(item.currentStock, item.minStock);
            const isHabis = status === 'Habis';
            const color = isHabis ? Colors.danger : Colors.amber;
            const bg = isHabis ? Colors.dangerLight : Colors.amberLight;
            const pct = item.minStock > 0
              ? Math.min(100, (item.currentStock / item.minStock) * 100)
              : 0;
            return (
              <View key={item.id} style={s.stokRow}>
                <View style={[s.stokIcon, { backgroundColor: bg }]}>
                  <Ionicons name={isHabis ? 'close-circle' : 'warning'} size={16} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.stokNameRow}>
                    <Text style={s.stokName}>{item.name}</Text>
                    <Text style={[s.stokQty, { color }]}>{item.currentStock} {item.unit}</Text>
                  </View>
                  <View style={s.stokBar}>
                    <View style={[s.stokBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Order Terbaru ──────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.cardTitleRow}>
            <View style={[s.dot, { backgroundColor: Colors.primary }]} />
            <Text style={s.cardTitle}>Order Terbaru</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/laporan')}>
            <Text style={s.seeAll}>Laporan →</Text>
          </TouchableOpacity>
        </View>

        {data.orderTerbaru.length === 0 ? (
          <View style={s.emptyBox}>
            <View style={s.emptyIllustration}>
              <Ionicons name="receipt-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={s.emptyTitle}>Belum ada order hari ini</Text>
            <Text style={s.emptyDesc}>Mulai catat order pertama Anda</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/order/cart')}>
              <Ionicons name="add-circle" size={16} color={Colors.white} />
              <Text style={s.emptyBtnText}>Buat Order Baru</Text>
            </TouchableOpacity>
          </View>
        ) : (
          data.orderTerbaru.map((order, idx) => {
            const cfg = STATUS_CFG[order.status] ?? { label: order.status, color: Colors.textMuted, bg: Colors.background, icon: 'ellipse-outline' };
            const timeStr = (order.createdAt ?? '').slice(11, 16);
            return (
              <View key={order.id} style={[s.orderRow, idx === 0 && { borderTopWidth: 0 }]}>
                <View style={[s.orderIconWrap, { backgroundColor: cfg.bg }]}>
                  <Ionicons name={cfg.icon} size={16} color={cfg.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.orderTable}>Meja {order.tableNo || '-'}</Text>
                  <Text style={s.orderTime}>{timeStr || '-'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={s.orderTotal}>{formatRupiah(order.total)}</Text>
                  <View style={[s.badge, { backgroundColor: cfg.bg }]}>
                    <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* ── Shortcut Katalog ───────────────────────────── */}
      <TouchableOpacity
        style={s.katalogShortcut}
        onPress={() => router.push('/(tabs)/katalog')}
      >
        <Ionicons name="restaurant" size={20} color={Colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={s.katalogTitle}>Lihat Katalog Menu</Text>
          <Text style={s.katalogDesc}>Tambah item ke keranjang & buat order</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
      </TouchableOpacity>

    </ScrollView>

    {/* ── Modal Pengaturan ────────────────────────────── */}
    <Modal visible={showSettings} animationType="slide" transparent>
      <View style={s.settingsOverlay}>
        <View style={s.settingsSheet}>
          <View style={s.settingsHandle} />
          <View style={s.settingsHeader}>
            <View style={s.settingsIconWrap}>
              <Ionicons name="settings" size={18} color={Colors.primary} />
            </View>
            <Text style={s.settingsTitle}>Pengaturan Usaha</Text>
            <TouchableOpacity style={s.settingsClose} onPress={() => setShowSettings(false)}>
              <Ionicons name="close" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Nama Usaha */}
          <Text style={s.settingsLabel}>Nama Usaha</Text>
          <View style={s.settingsInputRow}>
            <Ionicons name="storefront-outline" size={16} color={Colors.textMuted} />
            <TextInput
              style={s.settingsInput}
              value={formNama}
              onChangeText={setFormNama}
              placeholder="cth. Warung Bu Sari"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          {/* PPN */}
          <Text style={s.settingsLabel}>PPN / Pajak (%)</Text>
          <View style={s.settingsInputRow}>
            <Ionicons name="receipt-outline" size={16} color={Colors.textMuted} />
            <TextInput
              style={s.settingsInput}
              value={formPpn}
              onChangeText={setFormPpn}
              keyboardType="decimal-pad"
              placeholder="cth. 11"
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={s.settingsUnit}>%</Text>
          </View>

          {/* Preview */}
          <View style={s.ppnPreview}>
            <Text style={s.ppnPreviewLabel}>Contoh: order Rp 100.000</Text>
            <View style={s.ppnPreviewRow}>
              <Text style={s.ppnPreviewItem}>PPN {formPpn || '0'}%</Text>
              <Text style={s.ppnPreviewValue}>
                + Rp {((parseFloat(formPpn) || 0) * 1000).toLocaleString('id-ID')}
              </Text>
            </View>
            <View style={s.ppnPreviewRow}>
              <Text style={[s.ppnPreviewItem, { fontWeight: '700' }]}>Total</Text>
              <Text style={[s.ppnPreviewValue, { color: Colors.primary, fontWeight: '800' }]}>
                Rp {(100000 + (parseFloat(formPpn) || 0) * 1000).toLocaleString('id-ID')}
              </Text>
            </View>
          </View>

          {/* Preset cepat PPN */}
          <Text style={s.settingsLabel}>Pilihan Cepat</Text>
          <View style={s.ppnPresets}>
            {['0', '5', '10', '11', '12'].map((v) => (
              <TouchableOpacity
                key={v}
                style={[s.ppnChip, formPpn === v && s.ppnChipActive]}
                onPress={() => setFormPpn(v)}
              >
                <Text style={[s.ppnChipText, formPpn === v && s.ppnChipTextActive]}>
                  {v === '0' ? 'Tanpa PPN' : `${v}%`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={s.settingsSaveBtn} onPress={handleSaveSettings}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
            <Text style={s.settingsSaveBtnText}>Simpan Pengaturan</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </View>
  );
}

function MetricCard({
  icon, iconColor, label, value, sub, bg, onPress,
}: { icon: any; iconColor: string; label: string; value: string; sub: string; bg: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.metricCard, { borderLeftColor: iconColor, borderLeftWidth: 3 }]} onPress={onPress}>
      <View style={[s.metricIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={s.metricSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

const isWeb = Platform.OS === 'web';

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  content: {
    paddingBottom: 40,
    maxWidth: isWeb ? 900 : undefined,
    alignSelf: isWeb ? 'center' : undefined,
    width: '100%',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: FontSize.sm, color: Colors.textMuted },

  /* Header */
  header: {
    backgroundColor: Colors.white,
    padding: Spacing.md,
    paddingTop: isWeb ? 24 : Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.md },
  headerLogo: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary },
  headerDate: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  refreshBtn: {
    width: 36, height: 36, borderRadius: Radius.sm,
    backgroundColor: Colors.background,
    justifyContent: 'center', alignItems: 'center',
  },
  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  statCard: {
    flex: 1, borderRadius: Radius.md, padding: Spacing.md,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  statNumWhite: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.white },
  statDescWhite: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', marginTop: 3 },
  statNum: { fontSize: FontSize.xl, fontWeight: '800' },
  statDesc: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 3 },

  /* Section */
  section: {
    backgroundColor: Colors.white, margin: Spacing.md, marginBottom: 0,
    borderRadius: Radius.md, padding: Spacing.md,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm },

  /* Actions */
  actionsRow: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { flex: 1, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center', gap: 8 },
  actionIconWrap: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  actionLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  /* Metrics */
  metricsRow: { flexDirection: 'row', gap: Spacing.sm, marginHorizontal: Spacing.md, marginTop: Spacing.md },
  metricCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  metricIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  metricValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary },
  metricLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textPrimary, marginTop: 2 },
  metricSub: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },

  /* Card */
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md,
    marginHorizontal: Spacing.md, marginTop: Spacing.md,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  dot: { width: 8, height: 8, borderRadius: 4 },
  seeAll: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },

  /* Stok */
  stokRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10, borderTopWidth: 0.5, borderTopColor: Colors.border },
  stokIcon: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  stokNameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  stokName: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '500' },
  stokQty: { fontSize: FontSize.xs, fontWeight: '700' },
  stokBar: { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  stokBarFill: { height: '100%', borderRadius: 2 },

  /* Orders */
  orderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: Colors.border,
  },
  orderIconWrap: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  orderTable: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  orderTime: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  orderTotal: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  badge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700' },

  /* Empty state */
  emptyBox: { alignItems: 'center', paddingVertical: Spacing.lg, gap: 8 },
  emptyIllustration: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  emptyDesc: { fontSize: FontSize.sm, color: Colors.textMuted },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10, marginTop: 4,
  },
  emptyBtnText: { color: Colors.white, fontSize: FontSize.sm, fontWeight: '700' },

  /* Katalog shortcut */
  katalogShortcut: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.primaryLight, borderRadius: Radius.md,
    margin: Spacing.md, marginTop: Spacing.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.primary + '30',
  },
  katalogTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  katalogDesc: { fontSize: FontSize.xs, color: Colors.primary + 'A0', marginTop: 1 },

  /* Settings modal */
  settingsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  settingsSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.md, paddingBottom: 36,
  },
  settingsHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 16,
  },
  settingsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.md },
  settingsIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  settingsTitle: { flex: 1, fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary },
  settingsClose: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center',
  },
  settingsLabel: {
    fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary,
    marginTop: Spacing.md, marginBottom: 6,
  },
  settingsInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: 12, backgroundColor: Colors.background,
  },
  settingsInput: { flex: 1, fontSize: FontSize.base, color: Colors.textPrimary, paddingVertical: 11 },
  settingsUnit: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textSecondary },

  /* PPN preview */
  ppnPreview: {
    backgroundColor: Colors.primaryLight, borderRadius: Radius.sm,
    padding: Spacing.sm, marginTop: Spacing.sm, gap: 4,
  },
  ppnPreviewLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 2 },
  ppnPreviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ppnPreviewItem: { fontSize: FontSize.sm, color: Colors.textSecondary },
  ppnPreviewValue: { fontSize: FontSize.sm, color: Colors.textPrimary },

  /* PPN presets */
  ppnPresets: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  ppnChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  ppnChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  ppnChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  ppnChipTextActive: { color: Colors.white },

  /* Save button */
  settingsSaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    padding: Spacing.md, marginTop: Spacing.lg,
  },
  settingsSaveBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.base },
});
