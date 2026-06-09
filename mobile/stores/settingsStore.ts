import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'umkm_settings';

export interface AppSettings {
  ppn: number;        // persen, misal 11 = 11%
  namaUsaha: string;
  alamat: string;
  noTelp: string;
}

interface SettingsState extends AppSettings {
  loaded: boolean;
  load: () => Promise<void>;
  save: (updates: Partial<AppSettings>) => Promise<void>;
}

const DEFAULTS: AppSettings = {
  ppn: 11,
  namaUsaha: 'UMKM Pro',
  alamat: '',
  noTelp: '',
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: Partial<AppSettings> = JSON.parse(raw);
        set({ ...DEFAULTS, ...parsed, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  save: async (updates) => {
    const next = { ...get(), ...updates };
    set(next);
    try {
      const toSave: AppSettings = {
        ppn: next.ppn,
        namaUsaha: next.namaUsaha,
        alamat: next.alamat,
        noTelp: next.noTelp,
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {}
  },
}));
