import { Platform } from 'react-native';

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  localIP: string;
}

// Dapatkan local IP handphone di jaringan WiFi/hotspot
export async function getLocalIP(): Promise<string> {
  if (Platform.OS === 'web') return 'localhost';
  try {
    const Network = await import('expo-network');
    const ip = await Network.getIpAddressAsync();
    return ip || '0.0.0.0';
  } catch {
    return '0.0.0.0';
  }
}

// Cek apakah ada koneksi internet (bisa reach Supabase)
export async function checkInternetConnection(): Promise<boolean> {
  if (Platform.OS === 'web') return navigator.onLine;
  try {
    const Network = await import('expo-network');
    const state = await Network.getNetworkStateAsync();
    return !!(state.isConnected && state.isInternetReachable);
  } catch {
    // Fallback: coba fetch ke server publik
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      await fetch('https://dns.google/resolve?name=supabase.co', { signal: controller.signal });
      clearTimeout(timeout);
      return true;
    } catch {
      return false;
    }
  }
}

// Dapatkan state jaringan lengkap
export async function getNetworkState(): Promise<NetworkState> {
  if (Platform.OS === 'web') {
    return { isConnected: navigator.onLine, isInternetReachable: navigator.onLine, localIP: 'localhost' };
  }
  try {
    const Network = await import('expo-network');
    const [state, ip] = await Promise.all([
      Network.getNetworkStateAsync(),
      Network.getIpAddressAsync().catch(() => '0.0.0.0'),
    ]);
    return {
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable ?? false,
      localIP: ip || '0.0.0.0',
    };
  } catch {
    return { isConnected: false, isInternetReachable: false, localIP: '0.0.0.0' };
  }
}
