import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform, RefreshControl, Modal, TextInput, Alert, Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getDB } from '../../lib/db';
import { getStokStatus } from '../../stores/stokStore';
import { formatRupiah } from '../../lib/hpp-calculator';
import { useSettingsStore } from '../../stores/settingsStore';
import { useServerStore } from '../../stores/serverStore';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';
import ReceiptModal from '../../components/ReceiptModal';
import { ReceiptData } from '../../lib/printReceipt';

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

// Widget yang menampilkan URL server lokal dan status sync
function ServerStatusWidget() {
  const { serverRunning, serverURL, syncStatus, lastSync } = useServerStore();
  if (Platform.OS === 'web') return null;

  const syncLabel: Record<string, { text: string; color: string; icon: any }> = {
    idle:    { text: 'Tersinkron',   color: Colors.primary, icon: 'cloud-done-outline'    },
    syncing: { text: 'Menyinkron…', color: Colors.info,    icon: 'cloud-upload-outline'  },
    error:   { text: 'Sync gagal',  color: Colors.danger,  icon: 'cloud-offline-outline' },
    offline: { text: 'Offline',     color: Colors.amber,   icon: 'cloud-offline-outline' },
  };
  const sc = syncLabel[syncStatus] ?? syncLabel.idle;

  function copyURL() {
    if (serverURL) {
      Clipboard.setString(serverURL);
      Alert.alert('URL disalin!', serverURL);
    }
  }

  return (
    <View style={sw.container}>
      {/* Server lokal */}
      <View style={sw.row}>
        <Ionicons name={serverRunning ? 'wifi' : 'wifi-outline'} size={16} color={serverRunning ? Colors.primary : Colors.textMuted} />
        <Text style={sw.label}>Server Lokal</Text>
        {serverRunning && serverURL ? (
          <TouchableOpacity onPress={copyURL} style={sw.urlBtn}>
            <Text style={sw.url}>{serverURL}</Text>
            <Ionicons name="copy-outline" size={13} color={Colors.primary} />
          </TouchableOpacity>
        ) : (
          <Text style={[sw.url, { color: Colors.textMuted }]}>Tidak aktif</Text>
        )}
      </View>

      {/* Divider */}
      <View style={sw.divider} />

      {/* Sync Supabase */}
      <View style={sw.row}>
        <Ionicons name={sc.icon} size={16} color={sc.color} />
        <Text style={sw.label}>Supabase</Text>
        <Text style={[sw.syncText, { color: sc.color }]}>{sc.text}</Text>
        {lastSync && (
          <Text style={sw.lastSync}>
            {new Date(lastSync).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>

      {serverRunning && serverURL && (
        <Text style={sw.hint}>
          Buka <Text style={{ color: Colors.primary }}>{serverURL}</Text> di browser perangkat lain (WiFi sama)
        </Text>
      )}
    </View>
  );
}

const sw = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#e8f7f2',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  divider:  { height: 1, backgroundColor: '#f0f0f0', marginVertical: 7 },
  label:    { fontSize: 12, color: Colors.textSecondary, fontWeight: '500', marginRight: 2 },
  url:      { fontSize: 12, color: Colors.primary, fontWeight: '700', flex: 1 },
  urlBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  syncText: { fontSize: 12, fontWeight: '600', flex: 1 },
  lastSync: { fontSize: 11, color: Colors.textMuted },
  hint:     { fontSize: 11, color: Colors.textMuted, marginTop: 6, lineHeight: 15 },
});

export default function DashboardScreen() {
  const router = useRouter();
  const { ppn, namaUsaha, alamat, noTelp, save: saveSettings } = useSettingsStore();
  const [data, setData] = useState<DashboardData>({
    totalOrder: 0, pendapatan: 0, orderPending: 0, stokKritis: [], orderTerbaru: [], topMenu: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [formPpn, setFormPpn] = useState(String(ppn));
  const [formNama, setFormNama] = useState(namaUsaha);

  // ── Detail stok ───────────────────────────────────────────────────────────
  const [stokModal, setStokModal] = useState(false);
  const [stokDetail, setStokDetail] = useState<{
    id: string; name: string; category: string;
    currentStock: number; unit: string; minStock: number;
    movements: Array<{ type: string; qty: number; note: string; createdAt: string }>;
  } | null>(null);
  const [loadingStok, setLoadingStok] = useState(false);

  async function openStokDetail(ingredientId: string) {
    setLoadingStok(true);
    try {
      const db = await getDB();
      const [ing, moves] = await Promise.all([
        db.getFirstAsync('SELECT * FROM ingredients WHERE id = ?', ingredientId),
        db.getAllAsync(
          'SELECT * FROM stock_movements WHERE ingredient_id = ? ORDER BY created_at DESC LIMIT 20',
          ingredientId
        ),
      ]);
      if (!ing) return;
      setStokDetail({
        id: ing.id,
        name: ing.name,
        category: ing.category || '-',
        currentStock: ing.current_stock,
        unit: ing.unit,
        minStock: ing.min_stock,
        movements: (moves as any[]).map((m) => ({
          type: m.type,
          qty: m.qty,
          note: m.note || '-',
          createdAt: m.created_at,
        })),
      });
      setStokModal(true);
    } catch {
      Alert.alert('Gagal', 'Tidak dapat memuat data stok');
    } finally {
      setLoadingStok(false);
    }
  }

  // ── Detail order & struk ───────────────────────────────────────────────────
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  async function openOrderDetail(orderId: string) {
    setLoadingReceipt(true);
    try {
      const db = await getDB();

      const [fullOrder, orderItems, allMenus] = await Promise.all([
        db.getFirstAsync('SELECT * FROM orders WHERE id = ?', orderId),
        db.getAllAsync('SELECT * FROM order_items WHERE order_id = ?', orderId),
        db.getAllAsync('SELECT id, name FROM menus'),
      ]);

      if (!fullOrder) { Alert.alert('Data tidak ditemukan'); return; }

      const menuMap: Record<string, string> = {};
      for (const m of allMenus) menuMap[m.id] = m.name;

      const receipt: ReceiptData = {
        orderId: fullOrder.id.slice(0, 8).toUpperCase(),
        items: orderItems.map((i: any) => ({
          name: menuMap[i.menu_id] || 'Menu',
          qty: i.qty,
          price: i.price,
        })),
        tableNo: fullOrder.table_no || '-',
        paymentMethod: fullOrder.payment_method || '-',
        subtotal: fullOrder.subtotal || 0,
        tax: fullOrder.tax || 0,
        ppn,
        discount: fullOrder.discount || 0,
        total: fullOrder.total || 0,
        namaUsaha,
        alamat: alamat || '',
        noTelp: noTelp || '',
        createdAt: new Date(fullOrder.created_at).toLocaleString('id-ID', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }),
      };

      setReceiptData(receipt);
      setReceiptVisible(true);
    } catch (e) {
      Alert.alert('Gagal', 'Tidak dapat memuat detail order');
    } finally {
      setLoadingReceipt(false);
    }
  }

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

  async function markSelesai(orderId: string) {
    try {
      const db = await getDB();
      await db.runAsync(`UPDATE orders SET status = ? WHERE id = ?`, 'selesai', orderId);
      await loadData();
    } catch {
      Alert.alert('Gagal', 'Tidak dapat mengubah status order');
    }
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

      {/* ── Server & Sync Status ──────────────────────── */}
      <ServerStatusWidget />

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
              <TouchableOpacity
                key={item.id}
                style={s.stokRow}
                onPress={() => openStokDetail(item.id)}
                activeOpacity={0.7}
              >
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
                <Ionicons name="chevron-forward" size={14} color={color} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
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
              <TouchableOpacity
                key={order.id}
                style={[s.orderRow, idx === 0 && { borderTopWidth: 0 }]}
                onPress={() => openOrderDetail(order.id)}
                activeOpacity={0.7}
              >
                <View style={[s.orderIconWrap, { backgroundColor: cfg.bg }]}>
                  <Ionicons name={cfg.icon} size={16} color={cfg.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.orderTable}>Meja {order.tableNo || '-'}</Text>
                  <Text style={s.orderTime}>{timeStr || '-'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={s.orderTotal}>{formatRupiah(order.total)}</Text>
                  {order.status !== 'selesai' && order.status !== 'batal' ? (
                    <TouchableOpacity
                      style={s.selesaiBtn}
                      onPress={(e) => { e.stopPropagation?.(); markSelesai(order.id); }}
                    >
                      <Ionicons name="checkmark" size={11} color={Colors.white} />
                      <Text style={s.selesaiBtnText}>Selesai</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={[s.badge, { backgroundColor: cfg.bg }]}>
                      <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginLeft: 2 }} />
              </TouchableOpacity>
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

    {/* ── Loading overlay stok ────────────────────────── */}
    {loadingStok && (
      <View style={s.loadingOverlay}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.white, marginTop: 8, fontSize: FontSize.sm }}>Memuat stok...</Text>
      </View>
    )}

    {/* ── Modal Detail Stok ────────────────────────────── */}
    <Modal visible={stokModal} animationType="slide" transparent onRequestClose={() => setStokModal(false)}>
      <View style={s.settingsOverlay}>
        <View style={[s.settingsSheet, { maxHeight: '80%' }]}>
          <View style={s.settingsHandle} />

          {/* Header */}
          <View style={s.settingsHeader}>
            <View style={[s.settingsIconWrap, { backgroundColor: stokDetail && stokDetail.currentStock <= 0 ? Colors.dangerLight : Colors.amberLight }]}>
              <Ionicons name="layers" size={18} color={stokDetail && stokDetail.currentStock <= 0 ? Colors.danger : Colors.amber} />
            </View>
            <Text style={s.settingsTitle}>{stokDetail?.name ?? ''}</Text>
            <TouchableOpacity style={s.settingsClose} onPress={() => setStokModal(false)}>
              <Ionicons name="close" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {stokDetail && (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Kartu info utama */}
              <View style={sd.infoGrid}>
                <View style={sd.infoCard}>
                  <Text style={sd.infoVal}>{stokDetail.currentStock}</Text>
                  <Text style={sd.infoLbl}>{stokDetail.unit} tersisa</Text>
                </View>
                <View style={sd.infoCard}>
                  <Text style={[sd.infoVal, { color: Colors.amber }]}>{stokDetail.minStock}</Text>
                  <Text style={sd.infoLbl}>{stokDetail.unit} minimum</Text>
                </View>
                <View style={sd.infoCard}>
                  <Text style={sd.infoVal}>{stokDetail.category}</Text>
                  <Text style={sd.infoLbl}>Kategori</Text>
                </View>
              </View>

              {/* Progress bar */}
              {(() => {
                const pct = stokDetail.minStock > 0
                  ? Math.min(100, Math.round((stokDetail.currentStock / (stokDetail.minStock * 2)) * 100))
                  : 100;
                const statusStr = stokDetail.currentStock <= 0 ? 'Habis'
                  : stokDetail.currentStock <= stokDetail.minStock ? 'Kritis'
                  : stokDetail.currentStock <= stokDetail.minStock * 1.5 ? 'Rendah' : 'Aman';
                const barColor = statusStr === 'Aman' ? Colors.primary
                  : statusStr === 'Rendah' ? Colors.amber : Colors.danger;
                return (
                  <View style={sd.progSection}>
                    <View style={sd.progHeader}>
                      <Text style={sd.progLabel}>Level Stok</Text>
                      <View style={[sd.statusBadge, { backgroundColor: barColor + '20' }]}>
                        <Text style={[sd.statusText, { color: barColor }]}>{statusStr}</Text>
                      </View>
                    </View>
                    <View style={sd.progTrack}>
                      <View style={[sd.progFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                    </View>
                    <Text style={sd.progHint}>{pct}% dari level aman</Text>
                  </View>
                );
              })()}

              {/* Riwayat pergerakan */}
              <View style={sd.histSection}>
                <Text style={sd.histTitle}>Riwayat Pergerakan</Text>
                {stokDetail.movements.length === 0 ? (
                  <Text style={sd.histEmpty}>Belum ada pergerakan stok</Text>
                ) : (
                  stokDetail.movements.map((m, i) => {
                    const isIn = m.type === 'masuk';
                    return (
                      <View key={i} style={sd.histRow}>
                        <View style={[sd.histIcon, { backgroundColor: isIn ? Colors.primaryLight : Colors.dangerLight }]}>
                          <Ionicons name={isIn ? 'arrow-down-circle' : 'arrow-up-circle'} size={16} color={isIn ? Colors.primary : Colors.danger} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={sd.histNote}>{m.note}</Text>
                          <Text style={sd.histDate}>{(m.createdAt ?? '').slice(0, 16).replace('T', ' ')}</Text>
                        </View>
                        <Text style={[sd.histQty, { color: isIn ? Colors.primary : Colors.danger }]}>
                          {isIn ? '+' : '-'}{m.qty} {stokDetail.unit}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>
          )}

          <TouchableOpacity
            style={[s.settingsSaveBtn, { backgroundColor: Colors.info }]}
            onPress={() => { setStokModal(false); router.push('/(tabs)/stok'); }}
          >
            <Ionicons name="create-outline" size={18} color={Colors.white} />
            <Text style={s.settingsSaveBtnText}>Kelola Stok</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    {/* ── Loading overlay saat fetch detail order ─────── */}
    {loadingReceipt && (
      <View style={s.loadingOverlay}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.white, marginTop: 8, fontSize: FontSize.sm }}>Memuat detail...</Text>
      </View>
    )}

    {/* ── Struk / Detail Order ────────────────────────── */}
    <ReceiptModal
      visible={receiptVisible}
      data={receiptData}
      onClose={() => { setReceiptVisible(false); setReceiptData(null); }}
    />

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
  selesaiBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  selesaiBtnText: { fontSize: 10, fontWeight: '700', color: Colors.white },

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

  /* Loading overlay */
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },

  /* Save button */
  settingsSaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    padding: Spacing.md, marginTop: Spacing.lg,
  },
  settingsSaveBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.base },
});

const sd = StyleSheet.create({
  infoGrid: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  infoCard: {
    flex: 1, backgroundColor: Colors.background, borderRadius: Radius.sm,
    padding: Spacing.sm, alignItems: 'center',
  },
  infoVal: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary },
  infoLbl: { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },

  progSection: { paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  progHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  statusBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  progTrack: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 4 },
  progHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },

  histSection: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  histTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  histEmpty: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md },
  histRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: Colors.border,
  },
  histIcon: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  histNote: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '500' },
  histDate: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  histQty: { fontSize: FontSize.sm, fontWeight: '700' },
});
