import { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform, Alert, Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useServerStore } from '../stores/serverStore';
import { Colors, FontSize, Spacing, Radius } from '../constants/theme';
import QRCodeView from '../components/ui/QRCodeView';

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mnt = Math.floor(diff / 60_000);
  if (mnt < 1) return 'baru saja';
  if (mnt < 60) return `${mnt} menit lalu`;
  const jam = Math.floor(mnt / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export default function ServerScreen() {
  const {
    serverRunning, serverStarting, serverError, serverURL, localIP,
    requestCount, clients, recentActivity,
    startServer, stopServer,
  } = useServerStore();
  const [showLog, setShowLog] = useState(false);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.screen, styles.center]}>
        <Ionicons name="phone-portrait-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.webNote}>
          Server lokal hanya tersedia di aplikasi Android.{'\n'}
          Buka aplikasi di HP untuk menyalakan server.
        </Text>
      </View>
    );
  }

  const noIP = serverRunning && !serverURL;

  function copyURL() {
    if (serverURL) {
      Clipboard.setString(serverURL);
      Alert.alert('URL disalin!', serverURL);
    }
  }

  function confirmStop() {
    Alert.alert(
      'Matikan server?',
      'Perangkat lain tidak akan bisa mengakses kasir sampai server dinyalakan lagi.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Matikan', style: 'destructive', onPress: () => { stopServer(); } },
      ]
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xl }}>
      {/* ── Status & tombol ────────────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: serverRunning ? Colors.primary : Colors.textMuted }]} />
          <Text style={styles.statusText}>
            {serverStarting ? 'Menyalakan…' : serverRunning ? 'Server Aktif' : 'Server Mati'}
          </Text>
          {serverRunning && (
            <View style={styles.badgeOn}>
              <Ionicons name="wifi" size={12} color={Colors.primary} />
              <Text style={styles.badgeOnText}>Siaran di jaringan lokal</Text>
            </View>
          )}
        </View>

        {serverError && (
          <Text style={styles.errorText}>
            <Ionicons name="warning-outline" size={13} color={Colors.danger} /> {serverError}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.btn, serverRunning ? styles.btnDanger : styles.btnPrimary]}
          disabled={serverStarting}
          onPress={() => (serverRunning ? confirmStop() : startServer())}
        >
          {serverStarting
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Ionicons name={serverRunning ? 'power' : 'play'} size={16} color={Colors.white} />}
          <Text style={styles.btnText}>{serverRunning ? 'Matikan Server' : 'Nyalakan Server'}</Text>
        </TouchableOpacity>

        {serverRunning && (
          <Text style={styles.keepAwakeNote}>
            <Ionicons name="sunny-outline" size={12} color={Colors.amber} />{' '}
            Layar HP dijaga tetap menyala selama server aktif — jika layar mati, Android
            menghentikan server dan perangkat lain terputus.
          </Text>
        )}
      </View>

      {/* ── QR & alamat ────────────────────────────────────────────────── */}
      {serverRunning && serverURL && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hubungkan Perangkat Lain</Text>
          <Text style={styles.cardSub}>
            Scan QR ini dengan kamera HP/tablet lain yang tersambung ke WiFi atau hotspot yang sama.
          </Text>
          <QRCodeView value={serverURL} size={210} />
          <TouchableOpacity style={styles.urlRow} onPress={copyURL}>
            <Text style={styles.urlText}>{serverURL}</Text>
            <Ionicons name="copy-outline" size={16} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.urlHint}>Atau ketik alamat di atas langsung di browser. Ketuk untuk menyalin.</Text>
        </View>
      )}

      {noIP && (
        <View style={[styles.card, { borderColor: Colors.amber }]}>
          <Text style={[styles.cardTitle, { color: Colors.amber }]}>HP belum punya alamat jaringan</Text>
          <Text style={styles.cardSub}>
            Sambungkan HP ke WiFi, atau nyalakan hotspot HP ini lalu suruh perangkat lain
            bergabung ke hotspot tersebut.
          </Text>
        </View>
      )}

      {/* ── Statistik & perangkat terhubung ────────────────────────────── */}
      {serverRunning && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Aktivitas</Text>
          <View style={styles.statGrid}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{requestCount}</Text>
              <Text style={styles.statLbl}>Total Permintaan</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{clients.length}</Text>
              <Text style={styles.statLbl}>Perangkat Terhubung</Text>
            </View>
          </View>

          {clients.length === 0 ? (
            <Text style={styles.emptyText}>Belum ada perangkat yang mengakses server.</Text>
          ) : (
            clients.map((c) => (
              <View key={c.ip} style={styles.clientRow}>
                <Ionicons name="phone-portrait-outline" size={16} color={Colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientIP}>{c.ip}</Text>
                  <Text style={styles.clientMeta}>{c.requestCount} permintaan · aktif {relTime(c.lastSeen)}</Text>
                </View>
              </View>
            ))
          )}

          {recentActivity.length > 0 && (
            <>
              <TouchableOpacity style={styles.logToggle} onPress={() => setShowLog(!showLog)}>
                <Text style={styles.logToggleText}>{showLog ? 'Sembunyikan log' : 'Lihat log permintaan'}</Text>
                <Ionicons name={showLog ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.info} />
              </TouchableOpacity>
              {showLog && recentActivity.slice(0, 15).map((a, i) => (
                <View key={i} style={styles.logRow}>
                  <Text style={styles.logTime}>
                    {new Date(a.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </Text>
                  <Text style={styles.logText} numberOfLines={1}>{a.method} {a.path}</Text>
                  <Text style={styles.logIP}>{a.ip}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}

      {/* ── Panduan ────────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cara Pakai di Lapangan</Text>
        {[
          'Nyalakan hotspot di HP ini (Pengaturan → Hotspot), atau sambungkan semua perangkat ke WiFi yang sama.',
          'Suruh HP/tablet kasir lain bergabung ke hotspot/WiFi tersebut.',
          'Nyalakan server di layar ini, lalu scan QR dari perangkat lain.',
          'Halaman kasir terbuka di browser — bisa lihat dashboard, buat order, dan cek stok tanpa internet.',
        ].map((t, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
            <Text style={styles.stepText}>{t}</Text>
          </View>
        ))}
        <Text style={styles.tipText}>
          <Ionicons name="bulb-outline" size={12} color={Colors.amber} />{' '}
          Internet tidak diperlukan — data tersimpan di HP ini ({localIP !== '0.0.0.0' ? `IP: ${localIP}` : 'belum terhubung jaringan'})
          dan otomatis tersinkron ke cloud saat online kembali.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  webNote: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.md, lineHeight: 20 },

  card: {
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  cardTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  cardSub: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, marginBottom: Spacing.md },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  badgeOn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  badgeOnText: { fontSize: 10, color: Colors.primary, fontWeight: '600' },
  errorText: { fontSize: FontSize.xs, color: Colors.danger, marginBottom: Spacing.sm },

  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: Radius.sm },
  btnPrimary: { backgroundColor: Colors.primary },
  btnDanger: { backgroundColor: Colors.danger },
  btnText: { color: Colors.white, fontSize: FontSize.sm, fontWeight: '700' },
  keepAwakeNote: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: Spacing.sm, lineHeight: 16 },

  urlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.md, backgroundColor: Colors.primaryLight, paddingVertical: 10, borderRadius: Radius.sm },
  urlText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.primary },
  urlHint: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', marginTop: 6 },

  statGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  stat: { flex: 1, backgroundColor: Colors.background, borderRadius: Radius.sm, padding: Spacing.sm, alignItems: 'center' },
  statVal: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.primary },
  statLbl: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  emptyText: { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic', paddingVertical: 4 },

  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  clientIP: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  clientMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },

  logToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, marginTop: 4 },
  logToggleText: { fontSize: FontSize.xs, color: Colors.info, fontWeight: '600' },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  logTime: { fontSize: 10, color: Colors.textMuted, width: 56 },
  logText: { fontSize: 11, color: Colors.textSecondary, flex: 1 },
  logIP: { fontSize: 10, color: Colors.textMuted },

  stepRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.sm, alignItems: 'flex-start' },
  stepNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  stepText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },
  tipText: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4, lineHeight: 17, backgroundColor: Colors.amberLight, padding: Spacing.sm, borderRadius: Radius.sm },
});
