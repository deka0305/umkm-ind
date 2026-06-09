import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { pullFromSupabase, syncAll } from '../lib/sync';

const queryClient = new QueryClient();

export default function RootLayout() {
  const checkSession = useAuthStore((s) => s.checkSession);
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => {
    checkSession();
    loadSettings();
    pullFromSupabase().catch(() => {});
    syncAll().catch(() => {});
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
