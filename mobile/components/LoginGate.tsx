import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isPhoneClient } from '../lib/db';
import { useSettingsStore } from '../stores/settingsStore';
import { useSessionStore, listActiveStaff } from '../stores/sessionStore';
import { Colors, FontSize, Spacing, Radius } from '../constants/theme';

/** Layar login petugas — menutupi app selama PIN owner sudah diatur dan belum ada yang login.
 *  Dirender sebagai overlay (bukan pengganti <Stack>) karena expo-router butuh navigator
 *  selalu terpasang di root layout. */
export default function LoginGate() {
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const ownerPin = useSettingsStore((s) => s.ownerPin);
  const pinSet = useSettingsStore((s) => s.pinSet);
  const { petugas, loaded, load, login } = useSessionStore();

  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const required = isPhoneClient() ? !!pinSet : !!ownerPin;
  const visible = settingsLoaded && loaded && required && !petugas;

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!visible) return;
    setSelected(null); setPin(''); setError('');
    listActiveStaff().then(setStaff).catch(() => setStaff([]));
  }, [visible]);

  async function submit() {
    if (!selected) return;
    setBusy(true);
    setError('');
    const err = await login(selected.id, pin);
    setBusy(false);
    if (err) { setError(err); setPin(''); }
  }

  const options = [{ id: 'owner', name: 'Owner' }, ...staff];

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => {}}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Ionicons name="people" size={26} color={Colors.primary} />
          </View>
          <Text style={s.title}>Siapa yang bertugas?</Text>
          <Text style={s.sub}>Semua transaksi & perubahan dicatat atas nama petugas yang login.</Text>

          {options.map((o) => (
            <TouchableOpacity
              key={o.id}
              style={[s.option, selected?.id === o.id && s.optionActive]}
              onPress={() => { setSelected(o); setPin(''); setError(''); }}
            >
              <Ionicons
                name={o.id === 'owner' ? 'shield-checkmark' : 'person'}
                size={18}
                color={selected?.id === o.id ? Colors.white : Colors.textSecondary}
              />
              <Text style={[s.optionText, selected?.id === o.id && { color: Colors.white }]}>{o.name}</Text>
            </TouchableOpacity>
          ))}
          {staff.length === 0 && (
            <Text style={s.hint}>Belum ada akun petugas. Owner bisa menambahkannya di Pengaturan → Kelola Petugas.</Text>
          )}

          {selected && (
            <>
              <TextInput
                style={s.input}
                value={pin}
                onChangeText={setPin}
                placeholder={`PIN ${selected.name}`}
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                autoFocus
                onSubmitEditing={submit}
              />
              {!!error && <Text style={s.error}>{error}</Text>}
              <TouchableOpacity style={[s.btn, (busy || pin.length < 4) && { opacity: 0.5 }]} onPress={submit} disabled={busy || pin.length < 4}>
                {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={s.btnText}>Masuk</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: Spacing.md, backgroundColor: Colors.background },
  card: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, maxWidth: 420, width: '100%', alignSelf: 'center' },
  iconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: Spacing.sm },
  title: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  sub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', marginTop: 4, marginBottom: Spacing.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  optionActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  optionText: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary },
  hint: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 12, fontSize: FontSize.base, color: Colors.textPrimary, marginTop: 8, letterSpacing: 4, textAlign: 'center' },
  error: { color: Colors.danger, fontSize: FontSize.sm, marginTop: 8, textAlign: 'center' },
  btn: { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingVertical: 13, alignItems: 'center', marginTop: Spacing.sm },
  btnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.base },
});
