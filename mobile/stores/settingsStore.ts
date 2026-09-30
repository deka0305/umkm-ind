import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isPhoneClient } from '../lib/db';

const STORAGE_KEY = 'umkm_settings';

export interface AppSettings {
  ppn: number;        // persen, misal 11 = 11%
  namaUsaha: string;
  alamat: string;
  noTelp: string;
  /** Gambar QRIS statis merchant (data URI). Ditampilkan saat metode bayar QRIS. */
  qrisImage: string;
  /** PIN owner untuk batal order selesai, ubah pengaturan, reset data. Kosong = belum diatur.
   *  Hanya ada di HP utama — tidak pernah dikirim ke perangkat staf. */
  ownerPin: string;
}

interface SettingsState extends AppSettings {
  loaded: boolean;
  /** Perangkat staf: apakah HP utama sudah mengatur PIN (PIN-nya sendiri tidak dikirim). */
  pinSet?: boolean;
  load: () => Promise<void>;
  save: (updates: Partial<AppSettings>) => Promise<void>;
}

const DEFAULTS: AppSettings = {
  ppn: 11,
  namaUsaha: 'UMKM Pro',
  alamat: '',
  noTelp: '',
  qrisImage: '',
  ownerPin: '',
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    // Perangkat staf (web dari server HP): ambil settings HP utama, bukan
    // localStorage sendiri yang kosong — kalau tidak, PPN & QRIS ikut default.
    if (isPhoneClient()) {
      try {
        const res = await fetch('/api/settings');
        const body = await res.json();
        if (body?.success) {
          set({ ...DEFAULTS, ...body.data, loaded: true });
          return;
        }
      } catch {}
      set({ loaded: true });
      return;
    }

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
      // Ambil kunci dari DEFAULTS, bukan daftar manual — supaya field baru
      // ikut tersimpan otomatis tanpa perlu ingat menambahkannya di sini.
      const toSave = Object.fromEntries(
        Object.keys(DEFAULTS).map((k) => [k, (next as any)[k]])
      ) as AppSettings;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {}
  },
}));
