import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDB, generateId } from '../../lib/db';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

interface Booking {
  id: string;
  customerName: string;
  bookingDate: string;
  time: string;
  guests: number;
  tableType: string;
  purpose: string;
  status: string;
}

const EMPTY_FORM = { name: '', date: '', time: '', guests: '2', tableType: '', purpose: '' };

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  menunggu:     { label: 'Menunggu',     color: Colors.amber,   bg: Colors.amberLight,   icon: 'time-outline'             },
  terkonfirmasi:{ label: 'Terkonfirmasi',color: Colors.info,    bg: Colors.infoLight,    icon: 'checkmark-circle-outline' },
  diproses:     { label: 'Diproses',     color: Colors.primary, bg: Colors.primaryLight, icon: 'sync-outline'             },
  selesai:      { label: 'Selesai',      color: Colors.primary, bg: Colors.primaryLight, icon: 'ribbon-outline'           },
  dibatal:      { label: 'Dibatalkan',   color: Colors.danger,  bg: Colors.dangerLight,  icon: 'close-circle-outline'     },
};

const TABLE_TYPES = ['Reguler', 'VIP', 'Lesehan', 'Outdoor', 'Private Room'];

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function BookingScreen() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [dbError, setDbError] = useState(false);

  useEffect(() => { loadBookings(); }, []);

  async function loadBookings() {
    setLoading(true);
    try {
      const db = await getDB();
      // Query sederhana — tanpa JOIN, pakai customer_name langsung
      const rows = await db.getAllAsync<any>(
        `SELECT id, customer_name, booking_date, time, guests, table_type, purpose, status
         FROM bookings ORDER BY booking_date DESC`
      );
      setBookings(rows.map((r) => ({
        id: r.id,
        customerName: r.customer_name ?? 'Tamu',
        bookingDate: r.booking_date,
        time: r.time,
        guests: r.guests ?? 1,
        tableType: r.table_type ?? '',
        purpose: r.purpose ?? '',
        status: r.status ?? 'menunggu',
      })));
      setDbError(false);
    } catch (e) {
      console.error('loadBookings error:', e);
      setDbError(true);
    } finally {
      setLoading(false);
    }
  }

  async function saveBooking() {
    if (!form.name.trim()) return Alert.alert('Nama pemesan wajib diisi');
    if (!form.date) return Alert.alert('Tanggal wajib diisi');
    if (!form.time) return Alert.alert('Jam wajib diisi');
    setSaving(true);
    try {
      const db = await getDB();
      const result = await db.runAsync(
        `INSERT INTO bookings (id, customer_name, booking_date, time, guests, table_type, purpose, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'menunggu')`,
        generateId(), form.name.trim(), form.date, form.time,
        parseInt(form.guests) || 1, form.tableType, form.purpose
      );
      if (result?.error) throw new Error(result.error.message ?? 'Gagal menyimpan');
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      loadBookings();
    } catch (e: any) {
      Alert.alert(
        'Gagal Menyimpan',
        Platform.OS === 'web'
          ? 'Pastikan tabel "bookings" sudah dibuat di Supabase.\nJalankan file: migrations/supabase_schema.sql'
          : (e?.message ?? 'Terjadi kesalahan')
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const db = await getDB();
    await db.runAsync('UPDATE bookings SET status = ? WHERE id = ?', status, id);
    loadBookings();
  }

  function formatDate(d: string) {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return d; }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={s.loadingText}>Memuat data booking...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* ── DB Error Banner ─────────────────────────── */}
      {dbError && (
        <View style={s.errorBanner}>
          <Ionicons name="warning" size={16} color={Colors.amber} />
          <Text style={s.errorText}>
            Tabel bookings belum ada di Supabase.{'\n'}
            Jalankan: <Text style={{ fontWeight: '700' }}>migrations/supabase_schema.sql</Text>
          </Text>
        </View>
      )}

      {/* ── List Booking ────────────────────────────── */}
      <FlatList
        data={bookings}
        keyExtractor={(b) => b.id}
        contentContainerStyle={s.listContent}
        renderItem={({ item }) => {
          const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.menunggu;
          const isUpcoming = item.bookingDate >= todayDate();
          return (
            <View style={[s.card, isUpcoming && s.cardUpcoming]}>
              {/* Header */}
              <View style={s.cardHeader}>
                <View style={s.avatarWrap}>
                  <Text style={s.avatarText}>{item.customerName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.guestName}>{item.customerName}</Text>
                  {item.tableType ? (
                    <Text style={s.tableType}>{item.tableType}</Text>
                  ) : null}
                </View>
                <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                  <Ionicons name={cfg.icon} size={11} color={cfg.color} />
                  <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>

              {/* Details */}
              <View style={s.detailsWrap}>
                <View style={s.detailRow}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
                  <Text style={s.detailText}>{formatDate(item.bookingDate)}</Text>
                  <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                  <Text style={s.detailText}>{item.time}</Text>
                </View>
                <View style={s.detailRow}>
                  <Ionicons name="people-outline" size={14} color={Colors.textMuted} />
                  <Text style={s.detailText}>{item.guests} tamu</Text>
                </View>
                {item.purpose ? (
                  <View style={s.purposeWrap}>
                    <Ionicons name="chatbubble-outline" size={13} color={Colors.textMuted} />
                    <Text style={s.purposeText}>{item.purpose}</Text>
                  </View>
                ) : null}
              </View>

              {/* Actions — only for upcoming non-finished bookings */}
              {isUpcoming && item.status === 'menunggu' && (
                <View style={s.actionRow}>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: Colors.infoLight }]}
                    onPress={() => updateStatus(item.id, 'terkonfirmasi')}
                  >
                    <Ionicons name="checkmark" size={14} color={Colors.info} />
                    <Text style={[s.actionBtnText, { color: Colors.info }]}>Konfirmasi</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: Colors.dangerLight }]}
                    onPress={() =>
                      Alert.alert('Batalkan Booking?', `Booking untuk ${item.customerName} akan dibatalkan.`, [
                        { text: 'Kembali', style: 'cancel' },
                        { text: 'Batalkan', style: 'destructive', onPress: () => updateStatus(item.id, 'dibatal') },
                      ])
                    }
                  >
                    <Ionicons name="close" size={14} color={Colors.danger} />
                    <Text style={[s.actionBtnText, { color: Colors.danger }]}>Batalkan</Text>
                  </TouchableOpacity>
                </View>
              )}
              {isUpcoming && item.status === 'terkonfirmasi' && (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: Colors.primaryLight, alignSelf: 'flex-start' }]}
                  onPress={() => updateStatus(item.id, 'diproses')}
                >
                  <Ionicons name="sync" size={14} color={Colors.primary} />
                  <Text style={[s.actionBtnText, { color: Colors.primary }]}>Tandai Diproses</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <View style={s.emptyIllustration}>
              <Ionicons name="calendar-outline" size={44} color={Colors.primary} />
            </View>
            <Text style={s.emptyTitle}>Belum ada booking</Text>
            <Text style={s.emptyDesc}>Ketuk tombol + untuk tambah reservasi baru</Text>
          </View>
        }
      />

      {/* ── FAB ─────────────────────────────────────── */}
      <TouchableOpacity style={s.fab} onPress={() => { setForm({ ...EMPTY_FORM, date: todayDate() }); setShowForm(true); }}>
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>

      {/* ── Modal Form ──────────────────────────────── */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Tambah Booking</Text>
              <TouchableOpacity style={s.closeBtn} onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Nama */}
              <Text style={s.label}>Nama Pemesan *</Text>
              <View style={s.inputGroup}>
                <Ionicons name="person-outline" size={16} color={Colors.textMuted} />
                <TextInput
                  style={s.inputField}
                  value={form.name}
                  onChangeText={(v) => setForm({ ...form, name: v })}
                  placeholder="cth. Budi Santoso"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              {/* Tanggal & Jam */}
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Tanggal *</Text>
                  <View style={s.inputGroup}>
                    <Ionicons name="calendar-outline" size={15} color={Colors.textMuted} />
                    <TextInput
                      style={s.inputField}
                      value={form.date}
                      onChangeText={(v) => setForm({ ...form, date: v })}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Jam *</Text>
                  <View style={s.inputGroup}>
                    <Ionicons name="time-outline" size={15} color={Colors.textMuted} />
                    <TextInput
                      style={s.inputField}
                      value={form.time}
                      onChangeText={(v) => setForm({ ...form, time: v })}
                      placeholder="18:00"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                </View>
              </View>

              {/* Jumlah tamu */}
              <Text style={s.label}>Jumlah Tamu</Text>
              <View style={s.guestRow}>
                {['1','2','4','6','8','10+'].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[s.guestChip, form.guests === n && s.guestChipActive]}
                    onPress={() => setForm({ ...form, guests: n === '10+' ? '10' : n })}
                  >
                    <Text style={[s.guestChipText, form.guests === n && s.guestChipTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Jenis Meja */}
              <Text style={s.label}>Jenis Meja / Area</Text>
              <View style={s.tableTypeRow}>
                {TABLE_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.tableChip, form.tableType === t && s.tableChipActive]}
                    onPress={() => setForm({ ...form, tableType: form.tableType === t ? '' : t })}
                  >
                    <Text style={[s.tableChipText, form.tableType === t && s.tableChipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Keperluan */}
              <Text style={s.label}>Keperluan / Catatan</Text>
              <View style={[s.inputGroup, { alignItems: 'flex-start', paddingTop: 10 }]}>
                <Ionicons name="chatbubble-outline" size={15} color={Colors.textMuted} style={{ marginTop: 2 }} />
                <TextInput
                  style={[s.inputField, { height: 72, textAlignVertical: 'top' }]}
                  value={form.purpose}
                  onChangeText={(v) => setForm({ ...form, purpose: v })}
                  placeholder="cth. Ulang tahun, arisan keluarga..."
                  multiline
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={s.btnRow}>
                <TouchableOpacity style={s.btnCancel} onPress={() => setShowForm(false)}>
                  <Text style={s.btnCancelText}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btnSave, saving && { opacity: 0.6 }]}
                  onPress={saveBooking}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color={Colors.white} size="small" />
                    : <>
                        <Ionicons name="checkmark-circle" size={16} color={Colors.white} />
                        <Text style={s.btnSaveText}>Simpan Booking</Text>
                      </>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: FontSize.sm, color: Colors.textMuted },

  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.amberLight, padding: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  errorText: { flex: 1, fontSize: FontSize.xs, color: Colors.amber, lineHeight: 18 },

  listContent: { padding: Spacing.md, paddingBottom: 100 },

  card: {
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md,
    marginBottom: Spacing.sm, elevation: 1,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  cardUpcoming: { borderLeftWidth: 3, borderLeftColor: Colors.primary },

  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatarWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: FontSize.md, fontWeight: '800', color: Colors.primary },
  guestName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  tableType: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4,
  },
  statusText: { fontSize: 10, fontWeight: '700' },

  detailsWrap: { gap: 5, borderTopWidth: 0.5, borderTopColor: Colors.border, paddingTop: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  purposeWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2 },
  purposeText: { flex: 1, fontSize: FontSize.sm, color: Colors.textMuted, fontStyle: 'italic' },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.sm,
  },
  actionBtnText: { fontSize: FontSize.xs, fontWeight: '700' },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
    elevation: 8, shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },

  emptyWrap: { flex: 1, alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIllustration: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textSecondary },
  emptyDesc: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },

  /* Modal sheet */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.md, maxHeight: '95%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Spacing.md,
  },
  sheetTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center',
  },

  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: Spacing.sm },
  inputGroup: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: 12, backgroundColor: Colors.background,
  },
  inputField: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, paddingVertical: 11 },

  row: { flexDirection: 'row', gap: 8 },

  guestRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  guestChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.sm,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  guestChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  guestChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  guestChipTextActive: { color: Colors.white },

  tableTypeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tableChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  tableChipActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  tableChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '500' },
  tableChipTextActive: { color: Colors.primary, fontWeight: '700' },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: Spacing.lg, marginBottom: Spacing.xl },
  btnCancel: {
    flex: 1, borderRadius: Radius.sm, padding: Spacing.sm, alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  btnCancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSize.sm },
  btnSave: {
    flex: 2, flexDirection: 'row', borderRadius: Radius.sm, padding: Spacing.sm,
    alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary,
  },
  btnSaveText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.sm },
});
