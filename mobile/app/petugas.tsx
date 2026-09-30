import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { isPhoneClient } from '../lib/db';
import { Ionicons } from '@expo/vector-icons';
import { hasOwnerPin, verifyOwnerPin } from '../lib/audit';
import { StaffRow, addStaff, listAllStaff, resetStaffPin, setStaffActive } from '../stores/sessionStore';
import { Colors, FontSize, Spacing, Radius } from '../constants/theme';

/** Kelola akun petugas. Data & PIN petugas tersimpan di HP utama; perangkat lewat server HP
 *  mengelolanya via API dengan PIN owner. Web online (Supabase) tidak punya data petugas. */
export default function PetugasScreen() {
  const [unlocked, setUnlocked] = useState(!hasOwnerPin());
  const [ownerPin, setOwnerPin] = useState('');
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPin, setResetPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (unlocked) refresh(); }, [unlocked]);

  async function refresh() {
    try { setStaff(await listAllStaff(ownerPin)); }
    catch (e: any) { setError(e?.message ?? 'Gagal memuat petugas'); }
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await fn(); await refresh(); }
    catch (e: any) { setError(e?.message ?? 'Gagal'); }
    finally { setBusy(false); }
  }

  if (Platform.OS === 'web' && !isPhoneClient()) {
    return (
      <View style={s.center}>
        <Ionicons name="phone-portrait-outline" size={32} color={Colors.textMuted} />
        <Text style={s.title}>Akun petugas ada di HP utama</Text>
        <Text style={s.muted}>
          Web ini terhubung langsung ke cloud, sedangkan akun & PIN petugas disimpan di HP utama
          agar tidak bocor. Kelola petugas langsung di HP, atau buka web lewat alamat server HP
          (Dashboard HP → Kelola server, contoh http://192.168.x.x:3333).
        </Text>
      </View>
    );
  }

  if (!unlocked) {
    return (
      <View style={s.center}>
        <Ionicons name="lock-closed" size={32} color={Colors.primary} />
        <Text style={s.title}>Masukkan PIN owner</Text>
        <TextInput
          style={[s.input, { width: 220, textAlign: 'center', letterSpacing: 4 }]}
          value={ownerPin}
          onChangeText={setOwnerPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          autoFocus
        />
        {!!error && <Text style={s.error}>{error}</Text>}
        <TouchableOpacity
          style={s.btn}
          onPress={async () => {
            const r = await verifyOwnerPin(ownerPin);
            if (r.ok) setUnlocked(true); else { setError(r.error ?? 'PIN salah'); setOwnerPin(''); }
          }}
        >
          <Text style={s.btnText}>Buka</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {!hasOwnerPin() && (
        <Text style={[s.error, { marginBottom: Spacing.sm }]}>
          ⚠ Atur PIN owner dulu (Dashboard → Pengaturan). Login petugas baru aktif setelah PIN owner diatur.
        </Text>
      )}

      <View style={s.card}>
        <Text style={s.cardTitle}>Tambah Petugas</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Nama petugas" placeholderTextColor={Colors.textMuted} />
        <TextInput
          style={s.input} value={pin} onChangeText={setPin} placeholder="PIN 4–6 angka"
          placeholderTextColor={Colors.textMuted} keyboardType="number-pad" secureTextEntry maxLength={6}
        />
        <TouchableOpacity
          style={[s.btn, busy && { opacity: 0.5 }]}
          disabled={busy}
          onPress={() => run(async () => { await addStaff(name, pin, ownerPin); setName(''); setPin(''); })}
        >
          {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={s.btnText}>Tambah</Text>}
        </TouchableOpacity>
        {!!error && <Text style={s.error}>{error}</Text>}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Daftar Petugas</Text>
        {staff.length === 0 && <Text style={s.muted}>Belum ada petugas</Text>}
        {staff.map((p) => (
          <View key={p.id} style={s.row}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[s.name, !p.active && { color: Colors.textMuted, textDecorationLine: 'line-through' }]}>{p.name}</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => { setResetFor(resetFor === p.id ? null : p.id); setResetPin(''); }}>
                  <Text style={s.link}>Ganti PIN</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => run(() => setStaffActive(p, !p.active, ownerPin))}>
                  <Text style={[s.link, { color: p.active ? Colors.danger : Colors.primary }]}>
                    {p.active ? 'Nonaktifkan' : 'Aktifkan'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {resetFor === p.id && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TextInput
                  style={[s.input, { flex: 1, marginBottom: 0 }]} value={resetPin} onChangeText={setResetPin}
                  placeholder="PIN baru" placeholderTextColor={Colors.textMuted}
                  keyboardType="number-pad" secureTextEntry maxLength={6}
                />
                <TouchableOpacity
                  style={[s.btn, { marginTop: 0, paddingHorizontal: 16 }]}
                  onPress={() => run(async () => { await resetStaffPin(p, resetPin, ownerPin); setResetFor(null); })}
                >
                  <Text style={s.btnText}>Simpan</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </View>

      <Text style={s.muted}>
        Petugas yang dinonaktifkan tidak bisa login lagi; riwayatnya tetap tersimpan.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: Spacing.md, backgroundColor: Colors.background },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  card: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  cardTitle: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.sm },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: FontSize.sm, color: Colors.textPrimary, marginBottom: Spacing.sm, backgroundColor: Colors.white,
  },
  btn: { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center', marginTop: 4 },
  btnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.base },
  error: { color: Colors.danger, fontSize: FontSize.sm, marginTop: 8 },
  muted: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' },
  row: { paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: Colors.border },
  name: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary },
  link: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
});
