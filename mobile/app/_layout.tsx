import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useServerStore } from '../stores/serverStore';
import { syncAll, pullFromSupabase, startAutoSync, startPushSync, onSyncStatusChange, onPullComplete, notifyDataChange } from '../lib/sync';
import { supabase } from '../lib/supabase';
import { useMenuStore } from '../stores/menuStore';
import { useStokStore } from '../stores/stokStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function RootLayout() {
  const checkSession = useAuthStore((s) => s.checkSession);
  const loadSettings = useSettingsStore((s) => s.load);
  const { setSyncStatus, startServer, stopServer, ensureServerAlive } = useServerStore();
  const stopAutoSyncRef = useRef<(() => void) | null>(null);
  const stopPushSyncRef = useRef<(() => void) | null>(null);
  const webPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchMenus = useMenuStore((s) => s.fetchMenus);
  const fetchIngredients = useStokStore((s) => s.fetchIngredients);

  useEffect(() => {
    checkSession();
    loadSettings();

    // Load awal: native pull dari Supabase ke SQLite; web langsung query Supabase via SupabaseDB
    if (Platform.OS === 'web') {
      fetchMenus().catch(() => {});
      fetchIngredients().catch(() => {});
      notifyDataChange();
      // Polling 30 detik — safety net jika Supabase Realtime belum dikonfigurasi untuk tabel menus/ingredients
      webPollRef.current = setInterval(() => {
        fetchMenus().catch(() => {});
        fetchIngredients().catch(() => {});
      }, 30_000);
    } else {
      pullFromSupabase().catch(() => {});
    }

    // Push-sync ringan setiap 3 detik — hanya kirim data pending ke Supabase.
    // Fallback jika dual-write gagal (offline sementara, network flicker, emulator).
    stopPushSyncRef.current = startPushSync(3_000);

    // Full sync (pull + push) setiap 5 menit — safety net untuk data yang sangat stale.
    stopAutoSyncRef.current = startAutoSync(5 * 60_000);

    // Update widget status sync
    const unsubSync = onSyncStatusChange((status, lastSync) => {
      setSyncStatus(status, lastSync);
    });

    // Refresh store setelah setiap pull selesai → UI otomatis update
    const unsubPull = onPullComplete(() => {
      fetchMenus().catch(() => {});
      fetchIngredients().catch(() => {});
    });

    // ── AppState: sync + cek server saat app dibuka dari background ──────────
    // Android bisa mematikan server TCP saat app di background; nyalakan ulang
    // otomatis dan perbarui IP (bisa berubah saat ganti WiFi/hotspot).
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        syncAll().catch(() => {});
        ensureServerAlive().catch(() => {});
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppState);

    // ── Realtime subscriptions: perubahan di Supabase → semua platform update ──
    // Native: pull → simpan ke SQLite → notify
    // Web: SupabaseDB sudah query Supabase langsung, cukup notify agar UI re-fetch
    const onRealtimeMenus = () => Platform.OS === 'web'
      ? (fetchMenus().catch(() => {}), notifyDataChange())
      : pullFromSupabase().catch(() => {});
    const onRealtimeIngredients = () => Platform.OS === 'web'
      ? (fetchIngredients().catch(() => {}), notifyDataChange())
      : pullFromSupabase().catch(() => {});
    const onRealtimeOrders = () => Platform.OS === 'web'
      ? notifyDataChange()
      : pullFromSupabase().catch(() => {});

    const channel = supabase
      .channel('umkm-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menus' }, onRealtimeMenus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, onRealtimeIngredients)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onRealtimeOrders)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[realtime] Terhubung — perubahan Supabase langsung masuk');
        }
      });

    // HTTP server lokal — otomatis nyala saat app dibuka (Android saja)
    startServer().catch(() => {});

    return () => {
      stopPushSyncRef.current?.();
      stopAutoSyncRef.current?.();
      unsubSync();
      unsubPull();
      appStateSub.remove();
      supabase.removeChannel(channel);
      stopServer().catch(() => {});
      if (webPollRef.current) { clearInterval(webPollRef.current); webPollRef.current = null; }
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="server" options={{ title: 'Server Lokal', headerBackTitle: 'Kembali' }} />
        <Stack.Screen name="order/cart" options={{ title: 'Order Baru', headerBackTitle: 'Kembali' }} />
        <Stack.Screen name="order/booking" options={{ title: 'Booking', headerBackTitle: 'Kembali' }} />
        <Stack.Screen name="po/index" options={{ title: 'Purchase Order', headerBackTitle: 'Kembali' }} />
      </Stack>
    </QueryClientProvider>
  );
}
