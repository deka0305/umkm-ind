import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useServerStore } from '../stores/serverStore';
import { syncAll, pullFromSupabase, startAutoSync, onSyncStatusChange, onPullComplete } from '../lib/sync';
import { startHTTPServer, stopHTTPServer } from '../lib/httpServer';
import { getLocalIP } from '../lib/networkUtils';
import { supabase } from '../lib/supabase';
import { useMenuStore } from '../stores/menuStore';
import { useStokStore } from '../stores/stokStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

const SERVER_PORT = 3000;

export default function RootLayout() {
  const checkSession = useAuthStore((s) => s.checkSession);
  const loadSettings = useSettingsStore((s) => s.load);
  const { setServerRunning, setSyncStatus } = useServerStore();
  const stopAutoSyncRef = useRef<(() => void) | null>(null);
  const fetchMenus = useMenuStore((s) => s.fetchMenus);
  const fetchIngredients = useStokStore((s) => s.fetchIngredients);

  useEffect(() => {
    checkSession();
    loadSettings();

    // Pull pertama saat app buka
    pullFromSupabase().catch(() => {});

    // Auto-sync setiap 15 detik (lebih responsif dari 60 detik)
    stopAutoSyncRef.current = startAutoSync(15_000);

    // Update widget status sync
    const unsubSync = onSyncStatusChange((status, lastSync) => {
      setSyncStatus(status, lastSync);
    });

    // Refresh store setelah setiap pull selesai → UI otomatis update
    const unsubPull = onPullComplete(() => {
      fetchMenus().catch(() => {});
      fetchIngredients().catch(() => {});
    });

    // ── AppState: sync langsung saat app dibuka dari background ──────────────
    // Ini yang paling terasa: buka app → data langsung terbaru
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        syncAll().catch(() => {});
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppState);

    // ── Realtime subscriptions: perubahan di Supabase → HP langsung update ───
    // Satu channel dengan listener untuk 3 tabel sekaligus
    const channel = supabase
      .channel('umkm-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menus' }, () => {
        pullFromSupabase().catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, () => {
        pullFromSupabase().catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        pullFromSupabase().catch(() => {});
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[realtime] Terhubung — perubahan Supabase langsung masuk');
        }
      });

    // HTTP server lokal
    (async () => {
      try {
        const result = await startHTTPServer(SERVER_PORT);
        if (result) {
          const ip = await getLocalIP();
          setServerRunning(true, ip, result.port);
        }
      } catch {
        setServerRunning(false);
      }
    })();

    return () => {
      stopAutoSyncRef.current?.();
      unsubSync();
      unsubPull();
      appStateSub.remove();
      supabase.removeChannel(channel);
      stopHTTPServer().catch(() => {});
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="order/cart" options={{ title: 'Order Baru', headerBackTitle: 'Kembali' }} />
        <Stack.Screen name="order/booking" options={{ title: 'Booking', headerBackTitle: 'Kembali' }} />
        <Stack.Screen name="po/index" options={{ title: 'Purchase Order', headerBackTitle: 'Kembali' }} />
      </Stack>
    </QueryClientProvider>
  );
}
