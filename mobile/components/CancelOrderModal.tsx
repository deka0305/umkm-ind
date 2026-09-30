import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { cancelOrder, cancelNeedsPin, getActor } from '../lib/audit';
import { formatRupiah } from '../lib/hpp-calculator';
import { Colors, FontSize, Spacing, Radius } from '../constants/theme';

export interface CancelTarget { id: string; tableNo: string; total: number; status: string }

const STATUS_LABEL: Record<string, string> = { pending: 'Menunggu', proses: 'Diproses', selesai: 'Selesai' };

/** Batal order: alasan wajib, pelaku = petugas login, PIN owner bila diperlukan
 *  (order sudah dibayar, atau yang membatalkan kasir). Stok menu dikembalikan. */
export default function CancelOrderModal({ order, onClose, onDone }: {
  order: CancelTarget | null; onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setReason(''); setPin(''); setError(''); }, [order?.id]);

  async function submit() {
    if (!order) return;
    setBusy(true);
    setError('');
    try {
      await cancelOrder(order.id, { reason, pin });
      onDone();
    } catch (e: any) {
      setError(e?.message ?? 'Gagal membatalkan order');
    } finally {
      setBusy(false);
    }
  }

  const needPin = !!order && cancelNeedsPin(order.status);

  return (
    <Modal visible={!!order} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <Text style={s.title}>Batalkan Order</Text>
          {order && (
            <Text style={s.info}>
              Meja {order.tableNo || '-'} · {formatRupiah(order.total)} · {STATUS_LABEL[order.status] ?? order.status}
              {'\n'}Stok menu akan dikembalikan. Pembatalan tercatat dan terlihat oleh owner.
            </Text>
          )}
          <TextInput
            style={s.input}
            placeholder="Alasan pembatalan (wajib)"
            placeholderTextColor={Colors.textMuted}
            value={reason}
            onChangeText={setReason}
          />
          <Text style={s.info}>Dicatat atas nama: <Text style={{ fontWeight: '700' }}>{getActor()}</Text></Text>
          {needPin && (
            <TextInput
              style={s.input}
              placeholder={order?.status === 'selesai' ? 'PIN owner — order ini sudah dibayar' : 'PIN owner — persetujuan pembatalan'}
              placeholderTextColor={Colors.textMuted}
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />
          )}
          {!!error && <Text style={s.error}>{error}</Text>}
          <TouchableOpacity style={[s.submit, busy && { opacity: 0.5 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator size={14} color={Colors.white} /> : <Text style={s.submitText}>Batalkan Order</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.back} onPress={onClose}>
            <Text style={s.backText}>Kembali</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.md, paddingBottom: 32 },
  title: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  info: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: FontSize.sm,
    color: Colors.textPrimary, marginBottom: Spacing.sm,
  },
  error: { color: Colors.danger, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  submit: { backgroundColor: Colors.danger, borderRadius: Radius.sm, paddingVertical: 12, alignItems: 'center' },
  submitText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.base },
  back: { marginTop: Spacing.md, paddingVertical: 12, borderRadius: Radius.sm, backgroundColor: Colors.background, alignItems: 'center' },
  backText: { fontSize: FontSize.base, color: Colors.textSecondary, fontWeight: '600' },
});
