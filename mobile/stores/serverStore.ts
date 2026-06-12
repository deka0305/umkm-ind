import { create } from 'zustand';
import { Platform } from 'react-native';
import { SyncStatus } from '../lib/sync';
import {
  startHTTPServer, stopHTTPServer, setActivityListener,
  isServerRunning, ServerActivity,
} from '../lib/httpServer';
import { getLocalIP } from '../lib/networkUtils';

const SERVER_PORT = 3333;
const KEEP_AWAKE_TAG = 'umkm-local-server';
const MAX_ACTIVITY_LOG = 30;

export interface ConnectedClient {
  ip: string;
  requestCount: number;
  lastSeen: string; // ISO timestamp
}

export interface ServerStore {
  // HTTP server
  serverRunning: boolean;
  serverStarting: boolean;
  serverError: string | null;
  serverPort: number;
  localIP: string;
  serverURL: string;   // e.g. "http://192.168.1.5:3333"

  // Statistik & kontrol
  requestCount: number;
  clients: ConnectedClient[];
  recentActivity: ServerActivity[];

  // Sync status
  syncStatus: SyncStatus;
  lastSync: Date | null;

  // Actions
  startServer: () => Promise<boolean>;
  stopServer: () => Promise<void>;
  refreshIP: () => Promise<void>;
  /** Restart server jika sebelumnya aktif tapi mati (mis. setelah app di-background). */
  ensureServerAlive: () => Promise<void>;
  setServerRunning: (running: boolean, ip?: string, port?: number) => void;
  setSyncStatus: (status: SyncStatus, lastSync?: Date | null) => void;
}

// Keep-awake: layar HP tetap menyala selama server aktif, karena Android
// menghentikan proses (termasuk server TCP) saat device masuk mode tidur.
async function setKeepAwake(active: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const KeepAwake = await import('expo-keep-awake');
    if (active) await KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    else KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
  } catch {}
}

export const useServerStore = create<ServerStore>((set, get) => ({
  serverRunning: false,
  serverStarting: false,
  serverError: null,
  serverPort: SERVER_PORT,
  localIP: '0.0.0.0',
  serverURL: '',

  requestCount: 0,
  clients: [],
  recentActivity: [],

  syncStatus: 'idle',
  lastSync: null,

  async startServer() {
    if (Platform.OS === 'web') return false;
    if (get().serverStarting) return false;

    set({ serverStarting: true, serverError: null });
    try {
      const result = await startHTTPServer(get().serverPort);
      if (!result) {
        set({ serverStarting: false, serverError: 'Server tidak didukung di perangkat ini' });
        return false;
      }

      // Catat setiap request masuk: total, per-perangkat, dan log terbaru
      setActivityListener((activity) => {
        const s = get();
        const clients = [...s.clients];
        const idx = clients.findIndex((c) => c.ip === activity.ip);
        if (idx >= 0) {
          clients[idx] = { ...clients[idx], requestCount: clients[idx].requestCount + 1, lastSeen: activity.time };
        } else {
          clients.push({ ip: activity.ip, requestCount: 1, lastSeen: activity.time });
        }
        clients.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
        set({
          requestCount: s.requestCount + 1,
          clients,
          recentActivity: [activity, ...s.recentActivity].slice(0, MAX_ACTIVITY_LOG),
        });
      });

      const ip = await getLocalIP();
      get().setServerRunning(true, ip, result.port);
      set({ serverStarting: false });
      await setKeepAwake(true);
      return true;
    } catch (err: any) {
      set({
        serverStarting: false,
        serverError: err?.message || 'Gagal menyalakan server',
      });
      get().setServerRunning(false);
      return false;
    }
  },

  async stopServer() {
    setActivityListener(null);
    await stopHTTPServer();
    await setKeepAwake(false);
    get().setServerRunning(false);
  },

  async refreshIP() {
    if (Platform.OS === 'web') return;
    const ip = await getLocalIP();
    const s = get();
    if (s.serverRunning && ip !== s.localIP) {
      s.setServerRunning(true, ip, s.serverPort);
    }
  },

  async ensureServerAlive() {
    if (Platform.OS === 'web') return;
    const s = get();
    if (s.serverRunning && !isServerRunning()) {
      // Server mati saat app di background — nyalakan ulang
      await s.startServer();
    } else if (s.serverRunning) {
      await s.refreshIP();
    }
  },

  setServerRunning(running, ip, port) {
    const p = port ?? get().serverPort;
    const i = ip ?? get().localIP;
    set({
      serverRunning: running,
      localIP: i,
      serverPort: p,
      serverURL: running && i !== '0.0.0.0' ? 'http://' + i + ':' + p : '',
    });
  },

  setSyncStatus(status, lastSync) {
    set({ syncStatus: status, lastSync: lastSync ?? get().lastSync });
  },
}));
