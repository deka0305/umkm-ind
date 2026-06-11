import { create } from 'zustand';
import { SyncStatus } from '../lib/sync';

export interface ServerStore {
  // HTTP server
  serverRunning: boolean;
  serverPort: number;
  localIP: string;
  serverURL: string;   // e.g. "http://192.168.1.5:3000"

  // Sync status
  syncStatus: SyncStatus;
  lastSync: Date | null;

  // Actions
  setServerRunning: (running: boolean, ip?: string, port?: number) => void;
  setSyncStatus: (status: SyncStatus, lastSync?: Date | null) => void;
}

export const useServerStore = create<ServerStore>((set, get) => ({
  serverRunning: false,
  serverPort: 3333,
  localIP: '0.0.0.0',
  serverURL: '',

  syncStatus: 'idle',
  lastSync: null,

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
