import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReceiptData, printReceipt } from '../lib/printReceipt';
import { formatRupiah } from '../lib/hpp-calculator';
import { Colors, FontSize, Spacing, Radius } from '../constants/theme';
import { useState } from 'react';

interface Props {
  visible: boolean;
  data: ReceiptData | null;
  onClose: () => void;
}

export default function ReceiptModal({ visible, data, onClose }: Props) {
  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    if (!data) return;
    setPrinting(true);
    try {
      await printReceipt(data);
    } catch (err) {
      Alert.alert('Gagal mencetak', String(err));
    } finally {
      setPrinting(false);
    }
  }

  if (!data) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.overlay}>
        <View style={s.sheet}>

          {/* ── Handle bar ── */}
          <View style={s.handle} />

          {/* ── Header bar ── */}
          <View style={s.topBar}>
            <Text style={s.topTitle}>Struk Pembayaran</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

            {/* ── Receipt paper ── */}
            <View style={s.paper}>

              {/* Header usaha */}
              <Text style={s.bizName}>{data.namaUsaha}</Text>
              {!!data.alamat && <Text style={s.bizSub}>{data.alamat}</Text>}
              {!!data.noTelp && <Text style={s.bizSub}>Telp: {data.noTelp}</Text>}

              <View style={s.dividerSolid} />

              {/* Meta order */}
              <View style={s.metaTable}>
                <MetaRow label="No. Order" value={`#${data.orderId}`} />
                <MetaRow label="Tanggal" value={data.createdAt} />
                {!!data.tableNo && <MetaRow label="Meja" value={data.tableNo} />}
                <MetaRow label="Pembayaran" value={data.paymentMethod} />
              </View>

              <View style={s.dividerDash} />

              {/* Items */}
              <Text style={s.sectionLabel}>Detail Pesanan</Text>
              {data.items.map((item, i) => (
                <View key={i} style={s.itemRow}>
                  <View style={s.itemTop}>
                    <Text style={s.itemName} numberOfLines={2}>{item.name}</Text>
                    <Text style={s.itemSubtotal}>{formatRupiah(item.price * item.qty)}</Text>
                  </View>
                  <Text style={s.itemQty}>{item.qty} x {formatRupiah(item.price)}</Text>
                </View>
              ))}

              <View style={s.dividerSolid} />

              {/* Summary */}
              <View style={s.summaryTable}>
                <SumRow label={`Subtotal (${data.items.length} item)`} value={formatRupiah(data.subtotal)} />
                <SumRow label={`PPN ${data.ppn}%`} value={formatRupiah(data.tax)} />
                {data.discount > 0 && (
                  <SumRow label="Diskon" value={`-${formatRupiah(data.discount)}`} valueColor={Colors.primary} />
                )}
              </View>

              <View style={s.dividerDash} />

              <View style={s.totalRow}>
                <Text style={s.totalLabel}>TOTAL</Text>
                <Text style={s.totalValue}>{formatRupiah(data.total)}</Text>
              </View>

              <View style={s.dividerDash} />

              {/* Payment status */}
              <View style={s.payBox}>
                <View style={s.payRow}>
                  <Text style={s.payLabel}>Metode Bayar</Text>
                  <Text style={s.payValue}>{data.paymentMethod}</Text>
                </View>
                <View style={s.payRow}>
                  <Text style={s.payLabel}>Status</Text>
                  <View style={s.paidBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={Colors.primary} />
                    <Text style={s.paidText}>Lunas</Text>
                  </View>
                </View>
              </View>

              <View style={s.dividerSolid} />

              {/* Footer */}
              <Text style={s.footerThanks}>Terima kasih!</Text>
              <Text style={s.footerSub}>Atas kepercayaan Anda berbelanja di sini</Text>
              <Text style={s.footerSub}>Simpan struk sebagai bukti pembayaran</Text>

            </View>
          </ScrollView>

          {/* ── Action buttons ── */}
          <View style={s.actions}>
            <TouchableOpacity style={s.printBtn} onPress={handlePrint} disabled={printing}>
              {printing
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Ionicons name="print-outline" size={18} color={Colors.white} />
              }
              <Text style={s.printBtnText}>{printing ? 'Mencetak...' : 'Cetak Struk'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeAction} onPress={onClose}>
              <Text style={s.closeActionText}>Tutup</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

function SumRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={s.sumRow}>
      <Text style={s.sumLabel}>{label}</Text>
      <Text style={[s.sumValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },

  /* Top bar */
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  topTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  closeBtn: { padding: 4 },

  scroll: { padding: Spacing.md },

  /* Paper */
  paper: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },

  /* Biz header */
  bizName: {
    fontSize: FontSize.lg, fontWeight: '900',
    textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase',
    color: Colors.textPrimary,
  },
  bizSub: {
    fontSize: FontSize.xs, color: Colors.textMuted,
    textAlign: 'center', marginTop: 2,
  },

  /* Dividers */
  dividerSolid: { borderTopWidth: 2, borderTopColor: Colors.textPrimary, borderStyle: 'solid', marginVertical: 8 },
  dividerDash:  { borderTopWidth: 1, borderTopColor: Colors.textMuted,    borderStyle: 'dashed', marginVertical: 8 },

  /* Meta */
  metaTable: { gap: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 },
  metaLabel: { fontSize: FontSize.xs, color: Colors.textMuted, flex: 1 },
  metaValue: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textPrimary, flex: 2, textAlign: 'right' },

  /* Section label */
  sectionLabel: {
    fontSize: 10, textTransform: 'uppercase',
    letterSpacing: 0.5, color: Colors.textMuted, marginBottom: 4,
  },

  /* Items */
  itemRow: {
    paddingVertical: 6,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary, flex: 1, marginRight: 8 },
  itemSubtotal: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  itemQty: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

  /* Summary */
  summaryTable: { gap: 3 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sumLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  sumValue: { fontSize: FontSize.xs, color: Colors.textPrimary },

  /* Total */
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: FontSize.lg, fontWeight: '900', color: Colors.textPrimary },
  totalValue: { fontSize: FontSize.lg, fontWeight: '900', color: Colors.textPrimary },

  /* Payment */
  payBox: { gap: 4 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  payValue: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textPrimary },
  paidBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primaryLight, borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  paidText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },

  /* Footer */
  footerThanks: {
    fontSize: FontSize.base, fontWeight: '700',
    textAlign: 'center', color: Colors.textPrimary, marginTop: 4,
  },
  footerSub: {
    fontSize: FontSize.xs, color: Colors.textMuted,
    textAlign: 'center', marginTop: 2,
  },

  /* Actions */
  actions: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  printBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 13,
  },
  printBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.sm },
  closeAction: {
    alignItems: 'center', paddingVertical: 10,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
  },
  closeActionText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
});
