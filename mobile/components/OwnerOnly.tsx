import { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsOwner } from '../stores/sessionStore';
import { Colors, FontSize, Spacing } from '../constants/theme';

/** Halaman khusus owner. Tab/tombolnya sudah disembunyikan untuk kasir; ini penjaga
 *  terakhir bila halaman dibuka lewat URL (web) atau tautan lain. */
export default function OwnerOnly({ children }: { children: ReactNode }) {
  const isOwner = useIsOwner();
  if (isOwner) return <>{children}</>;
  return (
    <View style={s.wrap}>
      <Ionicons name="lock-closed" size={36} color={Colors.textMuted} />
      <Text style={s.title}>Khusus Owner</Text>
      <Text style={s.sub}>Halaman ini hanya bisa dibuka owner. Ganti petugas ke Owner lewat nama di pojok kanan atas.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.md, backgroundColor: Colors.background },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  sub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', maxWidth: 320 },
});
