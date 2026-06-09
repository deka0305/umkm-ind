import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Alert, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore } from '../../stores/cartStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getDB, generateId } from '../../lib/db';
import { formatRupiah } from '../../lib/hpp-calculator';
import { ReceiptData } from '../../lib/printReceipt';
import ReceiptModal from '../../components/ReceiptModal';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

const PAYMENT_METHODS = [
  { key: 'Tunai',       icon: 'cash-outline'          },
  { key: 'QRIS',        icon: 'qr-code-outline'       },
  { key: 'Transfer',    icon: 'swap-horizontal-outline'},
  { key: 'Debit/Kredit',icon: 'card-outline'           },
];

export default function CartScreen() {
  const router = useRouter();
  const {
    items, tableNo, paymentMethod, discount,
    updateQty, removeItem, setTableNo, setPaymentMethod,
    getSubtotal, getTotal, clearCart,
  } = useCartStore();
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  const { ppn, namaUsaha, alamat, noTelp } = useSettingsStore();
  const subtotal = getSubtotal();
  const tax = subtotal * (ppn / 100);
  const total = getTotal();

  async function checkout() {
    if (items.length === 0) return Alert.alert('Keranjang kosong');
    // snapshot semua nilai sebelum operasi async agar tidak terpengaruh re-render
    const snapItems = items.map((i) => ({ menuId: i.menuId, name: i.name, qty: i.qty, price: i.price }));
    const snapTableNo = tableNo;
    const snapPayment = paymentMethod;
    const snapSubtotal = subtotal;
    const snapTax = tax;
    const snapDiscount = discount;
    const snapTotal = total;
    setLoading(true);
    try {
      const db = await getDB();
      const newOrderId = generateId();
      await db.runAsync(
        `INSERT INTO orders (id, table_no, status, payment_method, subtotal, tax, discount, total, note, created_at)
         VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, datetime('now'))`,
        newOrderId, snapTableNo, snapPayment, snapSubtotal, snapTax, snapDiscount, snapTotal, note
      );
      for (const item of snapItems) {
        await db.runAsync(
          `INSERT INTO order_items (id, order_id, menu_id, qty, price, subtotal) VALUES (?, ?, ?, ?, ?, ?)`,
          generateId(), newOrderId, item.menuId, item.qty, item.price, item.price * item.qty
        );
      }
      const shortId = newOrderId.slice(-6).toUpperCase();
      setOrderId(shortId);
      setReceiptData({
        orderId: shortId,
        items: snapItems,
        tableNo: snapTableNo,
        paymentMethod: snapPayment,
        subtotal: snapSubtotal,
        tax: snapTax,
        ppn,
        discount: snapDiscount,
        total: snapTotal,
        namaUsaha,
        alamat,
        noTelp,
        createdAt: new Date().toLocaleString('id-ID'),
      });
      clearCart();
      setShowSuccess(true);
    } catch (err) {
      Alert.alert('Gagal menyimpan order', String(err));
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0 && !showSuccess) {
    return (
      <View style={s.emptyContainer}>
        <View style={s.emptyIllustration}>
          <Ionicons name="cart-outline" size={52} color={Colors.primary} />
        </View>
        <Text style={s.emptyTitle}>Keranjang masih kosong</Text>
        <Text style={s.emptyDesc}>Tambahkan menu dari katalog untuk mulai order</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="restaurant-outline" size={16} color={Colors.white} />
          <Text style={s.backBtnText}>Pilih Menu</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

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
          <Text style={s.cardTitle}>Info Order</Text>
          <View style={s.inputGroup}>
            <Ionicons name="grid-outline" size={16} color={Colors.textMuted} />
            <TextInput
              style={s.inputField}
              placeholder="Nomor meja (opsional)"
              value={tableNo}
              onChangeText={setTableNo}
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={[s.inputGroup, { alignItems: 'flex-start', paddingTop: 10 }]}>
            <Ionicons name="chatbubble-outline" size={16} color={Colors.textMuted} style={{ marginTop: 2 }} />
            <TextInput
              style={[s.inputField, { height: 64, textAlignVertical: 'top' }]}
              placeholder="Catatan pesanan (opsional)"
              multiline
              value={note}
              onChangeText={setNote}
              placeholderTextColor={Colors.textMuted}
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
        <View>
          <Text style={s.footerLabel}>{items.length} item dipilih</Text>
          <Text style={s.footerTotal}>{formatRupiah(total)}</Text>
        </View>
        <TouchableOpacity
          style={[s.checkoutBtn, loading && { opacity: 0.7 }]}
          onPress={checkout}
          disabled={loading}
        >
          {loading
            ? <Text style={s.checkoutText}>Memproses...</Text>
            : <>
                <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                <Text style={s.checkoutText}>Bayar Sekarang</Text>
              </>
          }
        </TouchableOpacity>
      </View>

      {/* ── Success Modal ───────────────────────── */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={s.successOverlay}>
          <View style={s.successBox}>
            <View style={s.successIconWrap}>
              <Ionicons name="checkmark" size={42} color={Colors.white} />
            </View>
            <Text style={s.successTitle}>Order Berhasil!</Text>
            <Text style={s.successOrderId}>#{orderId}</Text>
            <Text style={s.successSub}>Order telah dicatat dan siap diproses</Text>
            <View style={s.successMeta}>
              <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
              <Text style={s.successMetaText}>{paymentMethod}</Text>
              <Ionicons name="card-outline" size={14} color={Colors.textMuted} />
              <Text style={s.successMetaText}>{formatRupiah(total)}</Text>
            </View>
            <TouchableOpacity
              style={s.printBtn}
              onPress={() => setShowReceipt(true)}
            >
              <Ionicons name="receipt-outline" size={16} color={Colors.primary} />
              <Text style={s.printBtnText}>Lihat &amp; Cetak Struk</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.successBtn}
              onPress={() => { setShowSuccess(false); router.replace('/(tabs)'); }}
            >
              <Text style={s.successBtnText}>Kembali ke Dashboard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.successBtnOutline}
              onPress={() => { setShowSuccess(false); router.replace('/(tabs)/katalog'); }}
            >
              <Text style={s.successBtnOutlineText}>Order Lagi</Text>
            </TouchableOpacity>
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
  content: { padding: Spacing.md, paddingBottom: 100, gap: Spacing.sm },

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
  inputField: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, paddingVertical: 11 },

  /* Payment */
  payGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
    backgroundColor: Colors.white, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: Colors.border,
    elevation: 12, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: -2 },
  },
  footerLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  footerTotal: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary },
  checkoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
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
});
