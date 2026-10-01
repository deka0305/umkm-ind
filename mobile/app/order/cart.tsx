import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Alert, Modal, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useCartStore } from '../../stores/cartStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getDB, generateId, isLocalDB } from '../../lib/db';

// HPP disalin saat terjual → laporan lama tetap benar walau HPP menu diubah.
// Hanya SQLite: kolom hpp belum ada di Supabase, dan parser SupabaseDB tidak paham subquery
// (param menu_id terakhir diabaikan di sana).
const INSERT_ITEM_SQL = isLocalDB()
  ? 'INSERT INTO order_items (id, order_id, menu_id, qty, price, subtotal, hpp) VALUES (?, ?, ?, ?, ?, ?, (SELECT hpp FROM menus WHERE id = ?))'
  : 'INSERT INTO order_items (id, order_id, menu_id, qty, price, subtotal) VALUES (?, ?, ?, ?, ?, ?)';
import { notifyDataChange } from '../../lib/sync';
import { logAudit } from '../../lib/audit';
import { supabase } from '../../lib/supabase';
import { checkInternetConnection } from '../../lib/networkUtils';
import { formatRupiah } from '../../lib/hpp-calculator';
import { ReceiptData } from '../../lib/printReceipt';
import ReceiptModal from '../../components/ReceiptModal';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';
import { useMenuStore } from '@/stores/menuStore';

const PAYMENT_METHODS = [
  { key: 'Tunai',       icon: 'cash-outline'          },
  { key: 'QRIS',        icon: 'qr-code-outline'       },
  { key: 'Transfer',    icon: 'swap-horizontal-outline'},
  { key: 'Debit/Kredit',icon: 'card-outline'           },
];

export default function CartScreen() {
  const router = useRouter();
  const {
    items, tableNo, paymentMethod, discount, editOrderId, editOrderTable,
    updateQty, removeItem, setTableNo, setPaymentMethod,
    getSubtotal, getTotal, clearCart,
  } = useCartStore();
  const isEditMode = editOrderId !== '';
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState<'bayar' | 'catat' | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [orderIsPending, setOrderIsPending] = useState(false);
  const [isAddMode, setIsAddMode] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  const { ppn, namaUsaha, alamat, noTelp, qrisImage } = useSettingsStore();
  const subtotal = getSubtotal();
  const tax = subtotal * (ppn / 100);
  const total = getTotal();

  async function checkout(mode: 'bayar' | 'catat') {
    if (items.length === 0) return Alert.alert('Keranjang kosong');
    setLoading(mode);
    try {
      const db = await getDB();

      // Ambil harga + stok terkini dari database untuk setiap item di cart
      const freshPrices: Record<string, { name: string; price: number; stock?: number }> = {};
      await Promise.all(
        items.map(async (item) => {
          const row = (await db.getFirstAsync(
            'SELECT name, sell_price, stock FROM menus WHERE id = ?',
            item.menuId
          )) as any;
          if (row) freshPrices[item.menuId] = { name: row.name, price: row.sell_price, stock: row.stock };
        })
      );

      // Stok bisa berkurang setelah item masuk keranjang (mis. order dari
      // perangkat staf lain lewat server lokal) — cek ulang sebelum simpan.
      const shortStock = items.filter((i) => {
        const stock = freshPrices[i.menuId]?.stock;
        return stock !== undefined && i.qty > stock;
      });
      if (shortStock.length > 0) {
        const detail = shortStock
          .map((i) => `• ${i.name}: diminta ${i.qty}, stok ${freshPrices[i.menuId].stock}`)
          .join('\n');
        setLoading(null);
        Alert.alert('Stok Tidak Cukup', `Order tidak bisa disimpan:\n\n${detail}\n\nKurangi jumlah pesanan.`);
        return;
      }

      // Deteksi perubahan harga
      const changed = items.filter(
        (i) => freshPrices[i.menuId] && freshPrices[i.menuId].price !== i.price
      );
      if (changed.length > 0) {
        const detail = changed
          .map((i) => `• ${i.name}: Rp ${i.price.toLocaleString('id-ID')} → Rp ${freshPrices[i.menuId].price.toLocaleString('id-ID')}`)
          .join('\n');
        setLoading(null);
        Alert.alert(
          'Harga Menu Berubah',
          `Beberapa harga telah diperbarui:\n\n${detail}\n\nTotal akan dihitung ulang.`,
          [{ text: 'Lanjutkan', onPress: () => doCheckout(freshPrices, mode) }]
        );
        return;
      }

      await doCheckout(freshPrices, mode);
    } catch (err) {
      Alert.alert('Gagal menyimpan order', String(err));
      setLoading(null);
    }
  }

  async function doCheckout(freshPrices: Record<string, { name: string; price: number }>, mode: 'bayar' | 'catat') {
    const status = mode === 'bayar' ? 'selesai' : 'pending';
    setLoading(mode);
    try {
      const db = await getDB();

      const snapItems = items.map((i) => ({
        menuId: i.menuId,
        name: freshPrices[i.menuId]?.name ?? i.name,
        qty: i.qty,
        price: freshPrices[i.menuId]?.price ?? i.price,
      }));
      const snapTableNo  = tableNo;
      const snapPayment  = paymentMethod;
      const snapSubtotal = snapItems.reduce((s, i) => s + i.price * i.qty, 0);
      const snapTax      = snapSubtotal * (ppn / 100);
      const snapDiscount = discount;
      const snapTotal    = snapSubtotal + snapTax - snapDiscount;
      const now          = new Date().toISOString();

      // Cek koneksi sebelum tulis (hanya native — web pakai SupabaseDB langsung)
      const online = Platform.OS !== 'web' && await checkInternetConnection();

      // ── 1. Simpan ke SQLite (selalu, cepat, offline-first) ──────────────────
      const newOrderId = generateId();
      await db.runAsync(
        `INSERT INTO orders
           (id, table_no, status, payment_method, subtotal, tax, discount, total, note, synced, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newOrderId, snapTableNo, status, snapPayment,
        snapSubtotal, snapTax, snapDiscount, snapTotal,
        note || null, online ? 1 : 0, now
      );

      // Simpan item dengan ID tetap agar bisa di-upsert ke Supabase dengan ID sama
      const snapItemsWithId = snapItems.map((i) => ({
        ...i,
        itemId: generateId(),
      }));
      for (const item of snapItemsWithId) {
        await db.runAsync(
          INSERT_ITEM_SQL,
          item.itemId, newOrderId, item.menuId, item.qty, item.price, item.price * item.qty, item.menuId
        );
        // Kurangi stok menu; synced=0 agar push sync kirim ke Supabase
        await db.runAsync(
          'UPDATE menus SET stock = MAX(0, stock - ?), synced = 0 WHERE id = ?',
          item.qty, item.menuId
        );
      }

      // ── 2. Update UI seketika (tidak tunggu Supabase) ────────────────────────
      const shortId = newOrderId.slice(-6).toUpperCase();
      setOrderId(shortId);
      setOrderIsPending(mode === 'catat');
      setReceiptData({
        orderId: shortId, items: snapItems, tableNo: snapTableNo,
        paymentMethod: snapPayment, subtotal: snapSubtotal, tax: snapTax,
        ppn, discount: snapDiscount, total: snapTotal,
        namaUsaha, alamat, noTelp,
        createdAt: new Date().toLocaleString('id-ID'),
      });
      clearCart();
      notifyDataChange();
      setShowSuccess(true);
      logAudit('order_baru', 'order', newOrderId, { total: snapTotal, status, payment: snapPayment });

      // ── 3. Tulis ke Supabase di background (jika ada internet) ───────────────
      // Web sudah tulis langsung via SupabaseDB — hanya native yang perlu ini
      if (online) {
        Promise.all([
          supabase.from('orders').upsert({
            id: newOrderId, table_no: snapTableNo, status,
            payment_method: snapPayment, subtotal: snapSubtotal, tax: snapTax,
            discount: snapDiscount, total: snapTotal,
            note: note || null, created_at: now,
          }),
          supabase.from('order_items').upsert(
            snapItemsWithId.map((i) => ({
              id: i.itemId, order_id: newOrderId, menu_id: i.menuId,
              qty: i.qty, price: i.price, subtotal: i.price * i.qty,
            }))
          ),
        ])
          // Supabase mengembalikan error sebagai nilai, bukan exception — cek keduanya
          .then((res) => { if (res.some((r) => r.error)) throw new Error('supabase'); })
          .catch(() => {
            // Gagal → synced=0 agar push sync kirim ulang order + item-nya
            db.runAsync('UPDATE orders SET synced = 0 WHERE id = ?', newOrderId).catch(() => {});
          });
      }
    } catch (err) {
      Alert.alert('Gagal menyimpan order', String(err));
    } finally {
      setLoading(null);
    }
  }

  async function doAddToOrder() {
    if (items.length === 0) return Alert.alert('Keranjang kosong');
    setLoading('bayar');
    try {
      const db = await getDB();

      const freshPrices: Record<string, { name: string; price: number }> = {};
      await Promise.all(
        items.map(async (item) => {
          const row = await db.getFirstAsync('SELECT name, sell_price FROM menus WHERE id = ?', item.menuId) as any;
          if (row) freshPrices[item.menuId] = { name: row.name, price: row.sell_price };
        })
      );

      const existing = await db.getFirstAsync(
        'SELECT subtotal, tax, discount, total FROM orders WHERE id = ?', editOrderId
      ) as any;
      if (!existing) throw new Error('Order tidak ditemukan');

      const snapItems = items.map((i) => ({
        menuId: i.menuId,
        name: freshPrices[i.menuId]?.name ?? i.name,
        qty: i.qty,
        price: freshPrices[i.menuId]?.price ?? i.price,
        itemId: generateId(),
      }));

      const addedSubtotal = snapItems.reduce((s, i) => s + i.price * i.qty, 0);
      const newSubtotal = (existing.subtotal ?? 0) + addedSubtotal;
      // PPN yang sudah ditagih tetap; tarif sekarang hanya untuk item tambahan
      const newTax = (existing.tax ?? 0) + addedSubtotal * (ppn / 100);
      const newTotal = newSubtotal + newTax - (existing.discount ?? 0);

      const online = Platform.OS !== 'web' && await checkInternetConnection();

      for (const item of snapItems) {
        await db.runAsync(
          INSERT_ITEM_SQL,
          item.itemId, editOrderId, item.menuId, item.qty, item.price, item.price * item.qty, item.menuId
        );
      }
      await db.runAsync(
        'UPDATE orders SET subtotal = ?, tax = ?, total = ?, synced = ? WHERE id = ?',
        newSubtotal, newTax, newTotal, online ? 1 : 0, editOrderId
      );
      logAudit('order_tambah_item', 'order', editOrderId, {
        oldTotal: existing.total, newTotal,
        items: snapItems.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
      });

      const shortId = editOrderId.slice(-6).toUpperCase();
      setOrderId(shortId);
      setIsAddMode(true);
      clearCart();
      notifyDataChange();
      setShowSuccess(true);

      if (online) {
        Promise.all([
          supabase.from('order_items').upsert(
            snapItems.map((i) => ({
              id: i.itemId, order_id: editOrderId, menu_id: i.menuId,
              qty: i.qty, price: i.price, subtotal: i.price * i.qty,
            }))
          ),
          supabase.from('orders').update({ subtotal: newSubtotal, tax: newTax, total: newTotal })
            .eq('id', editOrderId),
        ])
          .then((res) => { if (res.some((r) => r.error)) throw new Error('supabase'); })
          .catch(() => {
            db.runAsync('UPDATE orders SET synced = 0 WHERE id = ?', editOrderId).catch(() => {});
          });
      }
    } catch (err) {
      Alert.alert('Gagal menyimpan', String(err));
    } finally {
      setLoading(null);
    }
  }

  if (items.length === 0 && !showSuccess) {
    return (
      <View style={s.emptyContainer}>
        <View style={s.emptyIllustration}>
          <Ionicons name={isEditMode ? 'add-circle-outline' : 'cart-outline'} size={52} color={Colors.primary} />
        </View>
        <Text style={s.emptyTitle}>
          {isEditMode ? 'Pilih menu tambahan' : 'Keranjang masih kosong'}
        </Text>
        <Text style={s.emptyDesc}>
          {isEditMode
            ? `Tambahkan menu ke Order Meja ${editOrderTable}`
            : 'Tambahkan menu dari katalog untuk mulai order'}
        </Text>
        <TouchableOpacity style={s.backBtn} onPress={() => router.push('/(tabs)/katalog')}>
          <Ionicons name="restaurant-outline" size={16} color={Colors.white} />
          <Text style={s.backBtnText}>Pilih Menu</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Edit Order Banner ───────────────────── */}
        {isEditMode && (
          <View style={s.editBanner}>
            <Ionicons name="add-circle" size={15} color={Colors.info} />
            <Text style={s.editBannerText}>
              Menambahkan menu ke Order Meja {editOrderTable}
            </Text>
          </View>
        )}

        {/* ── Item List ────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Item Pesanan</Text>
          {items.map((item, idx) => (
            <View key={item.menuId} style={[s.itemRow, idx === 0 && { borderTopWidth: 0 }]}>
              <View style={s.itemLeft}>
                <View style={s.itemDot} />
                <View style={{ flex: 1 }}>
                  <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.itemPrice}>{formatRupiah(item.price)} / porsi</Text>
                </View>
              </View>
              <View style={s.qtyControl}>
                <TouchableOpacity
                  style={[s.qtyBtn, { backgroundColor: item.qty === 1 ? Colors.dangerLight : Colors.primaryLight }]}
                  onPress={() => item.qty === 1 ? removeItem(item.menuId) : updateQty(item.menuId, item.qty - 1)}
                >
                  <Ionicons name={item.qty === 1 ? 'trash-outline' : 'remove'} size={14} color={item.qty === 1 ? Colors.danger : Colors.primary} />
                </TouchableOpacity>
                <Text style={s.qtyText}>{item.qty}</Text>
                <TouchableOpacity
                  style={[s.qtyBtn, { backgroundColor: Colors.primaryLight }]}
                  onPress={() => updateQty(item.menuId, item.qty + 1)}
                >
                  <Ionicons name="add" size={14} color={Colors.primary} />
                </TouchableOpacity>
              </View>
              <Text style={s.subtotal}>{formatRupiah(item.price * item.qty)}</Text>
            </View>
          ))}
        </View>

        {/* ── Info Order ───────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>Info Order</Text>
            {isEditMode && (
              <View style={s.lockedBadge}>
                <Ionicons name="lock-closed" size={11} color={Colors.textMuted} />
                <Text style={s.lockedBadgeText}>Tidak dapat diubah</Text>
              </View>
            )}
          </View>
          <View style={[s.inputGroup, isEditMode && s.inputGroupDisabled]}>
            <Ionicons name="grid-outline" size={16} color={Colors.textMuted} />
            <TextInput
              style={[s.inputField, isEditMode && s.inputFieldDisabled]}
              placeholder="Nomor meja (opsional)"
              value={tableNo}
              onChangeText={setTableNo}
              placeholderTextColor={Colors.textMuted}
              editable={!isEditMode}
            />
          </View>
          <View style={[s.inputGroup, { alignItems: 'flex-start', paddingTop: 10 }, isEditMode && s.inputGroupDisabled]}>
            <Ionicons name="chatbubble-outline" size={16} color={Colors.textMuted} style={{ marginTop: 2 }} />
            <TextInput
              style={[s.inputField, { height: 64, textAlignVertical: 'top' }, isEditMode && s.inputFieldDisabled]}
              placeholder="Catatan pesanan (opsional)"
              multiline
              value={note}
              onChangeText={setNote}
              placeholderTextColor={Colors.textMuted}
              editable={!isEditMode}
            />
          </View>
        </View>

        {/* ── Metode Bayar ────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Metode Pembayaran</Text>
          <View style={s.payGrid}>
            {PAYMENT_METHODS.map(({ key, icon }) => {
              const active = paymentMethod === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.payBtn, active && s.payBtnActive]}
                  onPress={() => setPaymentMethod(key)}
                >
                  <Ionicons name={icon as any} size={18} color={active ? Colors.primary : Colors.textMuted} />
                  <Text style={[s.payBtnText, active && s.payBtnTextActive]}>{key}</Text>
                  {active && (
                    <View style={s.payCheck}>
                      <Ionicons name="checkmark" size={10} color={Colors.white} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* QRIS statis merchant — pelanggan pindai, nominal diketik sendiri */}
          {paymentMethod === 'QRIS' && (
            qrisImage ? (
              <View style={s.qrisBox}>
                <Image source={{ uri: qrisImage }} style={s.qrisImg} resizeMode="contain" />
                <Text style={s.qrisTotal}>{formatRupiah(total)}</Text>
                <Text style={s.qrisHint}>
                  Minta pelanggan memindai QR ini dan memasukkan nominal di atas.
                  Pastikan uang masuk sebelum menekan Bayar.
                </Text>
              </View>
            ) : (
              <View style={s.qrisBox}>
                <Ionicons name="qr-code-outline" size={28} color={Colors.textMuted} />
                <Text style={s.qrisHint}>
                  Gambar QRIS belum diunggah. Buka Dashboard → Pengaturan → Gambar QRIS.
                </Text>
              </View>
            )
          )}
        </View>

        {/* ── Ringkasan Pembayaran ─────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Ringkasan Pembayaran</Text>
          <SummaryRow label="Subtotal" value={formatRupiah(subtotal)} />
          <SummaryRow label={`PPN (${ppn}%)`} value={formatRupiah(tax)} />
          {discount > 0 && <SummaryRow label="Diskon" value={`-${formatRupiah(discount)}`} color={Colors.primary} />}
          <View style={s.totalDivider} />
          <SummaryRow label="Total Bayar" value={formatRupiah(total)} bold />
        </View>

      </ScrollView>

      {/* ── Sticky Footer ───────────────────────── */}
      <View style={s.footer}>
        <View style={s.footerInfo}>
          <Text style={s.footerLabel}>{items.length} item dipilih</Text>
          <Text style={s.footerTotal}>{formatRupiah(isEditMode ? getSubtotal() : total)}</Text>
        </View>
        <View style={s.footerBtns}>
          {isEditMode ? (
            <TouchableOpacity
              style={[s.checkoutBtn, loading !== null && { opacity: 0.7 }]}
              onPress={doAddToOrder}
              disabled={loading !== null}
            >
              {loading === 'bayar'
                ? <Text style={s.checkoutText}>Menyimpan...</Text>
                : <>
                    <Ionicons name="add-circle" size={18} color={Colors.white} />
                    <Text style={s.checkoutText}>Simpan Tambahan</Text>
                  </>
              }
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[s.catatBtn, loading !== null && { opacity: 0.7 }]}
                onPress={() => checkout('catat')}
                disabled={loading !== null}
              >
                {loading === 'catat'
                  ? <Text style={s.catatText}>Mencatat...</Text>
                  : <>
                      <Ionicons name="time-outline" size={16} color={Colors.amber} />
                      <Text style={s.catatText}>Bayar nanti</Text>
                    </>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.checkoutBtn, loading !== null && { opacity: 0.7 }]}
                onPress={() => checkout('bayar')}
                disabled={loading !== null}
              >
                {loading === 'bayar'
                  ? <Text style={s.checkoutText}>Memproses...</Text>
                  : <>
                      <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                      <Text style={s.checkoutText}>Bayar Sekarang</Text>
                    </>
                }
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* ── Success Modal ───────────────────────── */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={s.successOverlay}>
          <View style={s.successBox}>
            <View style={[s.successIconWrap, !isAddMode && orderIsPending && { backgroundColor: Colors.amber }, isAddMode && { backgroundColor: Colors.info }]}>
              <Ionicons name={isAddMode ? 'add-circle' : orderIsPending ? 'time' : 'checkmark'} size={42} color={Colors.white} />
            </View>
            <Text style={s.successTitle}>
              {isAddMode ? 'Menu Ditambahkan!' : orderIsPending ? 'Pesanan Dicatat!' : 'Order Berhasil!'}
            </Text>
            <Text style={s.successOrderId}>#{orderId}</Text>
            <Text style={s.successSub}>
              {isAddMode
                ? 'Item baru berhasil ditambahkan ke order'
                : orderIsPending
                  ? 'Pesanan menunggu — tandai Selesai di dashboard setelah dibayar'
                  : 'Order telah dicatat dan siap diproses'}
            </Text>
            {!isAddMode && (
              <View style={s.successMeta}>
                <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                <Text style={s.successMetaText}>{paymentMethod}</Text>
                <Ionicons name="card-outline" size={14} color={Colors.textMuted} />
                <Text style={s.successMetaText}>{formatRupiah(total)}</Text>
              </View>
            )}
            {!isAddMode && (
              <TouchableOpacity style={s.printBtn} onPress={() => setShowReceipt(true)}>
                <Ionicons name="receipt-outline" size={16} color={Colors.primary} />
                <Text style={s.printBtnText}>Lihat &amp; Cetak Struk</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.successBtn}
              onPress={() => { setShowSuccess(false); setIsAddMode(false); router.replace('/(tabs)'); }}
            >
              <Text style={s.successBtnText}>Kembali ke Dashboard</Text>
            </TouchableOpacity>
            {!isAddMode && (
              <TouchableOpacity
                style={s.successBtnOutline}
                onPress={() => { setShowSuccess(false); router.replace('/(tabs)/katalog'); }}
              >
                <Text style={s.successBtnOutlineText}>Order Lagi</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <ReceiptModal
        visible={showReceipt}
        data={receiptData}
        onClose={() => setShowReceipt(false)}
      />
    </View>
  );
}

function SummaryRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={[s.summaryValue, bold && s.summaryBold, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 140, gap: Spacing.sm },

  /* Empty state */
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, padding: Spacing.xl },
  emptyIllustration: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  emptyTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  emptyDesc: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, marginTop: 8,
  },
  backBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.sm },

  /* Card */
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  lockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.border, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  lockedBadgeText: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },

  /* Items */
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: Colors.border,
  },
  itemLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  itemName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  itemPrice: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  qtyText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary, minWidth: 22, textAlign: 'center' },
  subtotal: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary, minWidth: 68, textAlign: 'right' },

  /* Input group */
  inputGroup: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: 12, marginBottom: 8, backgroundColor: Colors.background,
  },
  inputGroupDisabled: { backgroundColor: Colors.border, borderColor: Colors.border, opacity: 0.7 },
  inputField: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, paddingVertical: 11 },
  inputFieldDisabled: { color: Colors.textMuted },

  /* Payment */
  payGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  qrisBox: {
    marginTop: Spacing.md, padding: Spacing.md, alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
  },
  qrisImg: { width: '100%', height: 260, borderRadius: Radius.sm },
  qrisTotal: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primary },
  qrisHint: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 8, position: 'relative',
    backgroundColor: Colors.background,
  },
  payBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  payBtnText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  payBtnTextActive: { color: Colors.primary, fontWeight: '700' },
  payCheck: {
    position: 'absolute', top: -5, right: -5,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
  },

  /* Summary */
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  summaryLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  summaryValue: { fontSize: FontSize.sm, color: Colors.textPrimary },
  summaryBold: { fontWeight: '800', fontSize: FontSize.base, color: Colors.textPrimary },
  totalDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 8 },

  /* Footer */
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.white, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: 16,
    flexDirection: 'column', gap: 8,
    borderTopWidth: 1, borderTopColor: Colors.border,
    elevation: 12, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: -2 },
  },
  footerInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  footerTotal: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary },
  footerBtns: { flexDirection: 'row', gap: 8 },
  catatBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: Colors.amber, borderRadius: Radius.md,
    paddingVertical: 13, backgroundColor: Colors.amberLight,
  },
  catatText: { color: Colors.amber, fontWeight: '700', fontSize: FontSize.sm },
  checkoutBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 13,
  },
  checkoutText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.sm },

  /* Success Modal */
  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  successBox: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: Spacing.lg, alignItems: 'center', gap: 8, width: '100%',
  },
  successIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  successTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary },
  successOrderId: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary, letterSpacing: 2 },
  successSub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },
  successMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.background, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  successMetaText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  successBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: Spacing.xl, paddingVertical: 12, width: '100%', alignItems: 'center', marginTop: 8,
  },
  successBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.sm },
  successBtnOutline: {
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: Spacing.xl, paddingVertical: 12, width: '100%', alignItems: 'center',
  },
  successBtnOutlineText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  printBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 12, width: '100%', backgroundColor: Colors.primaryLight, marginTop: 8,
  },
  printBtnText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },

  /* Edit order banner */
  editBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.infoLight, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.info + '30',
  },
  editBannerText: { flex: 1, fontSize: FontSize.sm, color: Colors.info, fontWeight: '600' },
});
