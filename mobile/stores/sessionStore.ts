import { create } from 'zustand';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDB, generateId, isPhoneClient } from '../lib/db';
import { checkStaffLoginLocal, logAudit } from '../lib/audit';

// ─── Sesi petugas per perangkat ───────────────────────────────────────────────
// Aktif begitu PIN owner diatur: setiap perangkat (HP utama & perangkat staf) wajib
// login sebagai Owner atau salah satu petugas. Nama di audit log diambil dari sini,
// bukan diketik bebas.

export interface Petugas { id: string; name: string; role: 'owner' | 'kasir' }
export interface StaffRow { id: string; name: string; active: number; created_at?: string }

const SESSION_KEY = 'umkm_session';

interface SessionState {
  petugas: Petugas | null;
  loaded: boolean;
  load: () => Promise<void>;
  login: (staffId: string, pin: string) => Promise<string | null>; // null = sukses, string = error
  logout: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  petugas: null,
  loaded: false,

  load: async () => {
    let petugas: Petugas | null = null;
    try {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      if (raw) petugas = JSON.parse(raw);
    } catch {}
    // Petugas yang sudah dinonaktifkan owner → paksa login ulang
    if (petugas?.role === 'kasir') {
      const active = await listActiveStaff().catch(() => null);
      if (active && !active.some((s) => s.id === petugas!.id)) petugas = null;
    }
    set({ petugas, loaded: true });
  },

  login: async (staffId, pin) => {
    let r: { ok: boolean; error?: string; name?: string };
    if (isPhoneClient()) {
      try {
        const res = await fetch('/api/staff-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staffId, pin }),
        });
        r = await res.json();
      } catch {
        r = { ok: false, error: 'Tidak bisa menghubungi HP utama' };
      }
    } else {
      r = await checkStaffLoginLocal(staffId, pin);
    }
    if (!r.ok) return r.error || 'PIN salah';

    const petugas: Petugas = { id: staffId, name: r.name || 'Petugas', role: staffId === 'owner' ? 'owner' : 'kasir' };
    try { await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(petugas)); } catch {}
    set({ petugas });
    logAudit('login', 'petugas', staffId, {});
    return null;
  },

  logout: async () => {
    if (get().petugas) await logAudit('logout', 'petugas', get().petugas!.id, {});
    try { await AsyncStorage.removeItem(SESSION_KEY); } catch {}
    set({ petugas: null });
  },
}));

// ─── Peran ────────────────────────────────────────────────────────────────────
// Owner = akses penuh. Kasir = order & booking saja. Belum ada PIN owner (login belum
// aktif) → dianggap owner, karena keamanan memang belum diatur.

const ownerOf = (p: Petugas | null) => !p || p.role === 'owner';

/** Hook reaktif — UI ikut berubah saat ganti petugas. */
export function useIsOwner(): boolean {
  return useSessionStore((s) => ownerOf(s.petugas));
}

export function isOwnerSession(): boolean {
  return ownerOf(useSessionStore.getState().petugas);
}

// ─── Data petugas ─────────────────────────────────────────────────────────────

/** Nama petugas aktif untuk layar login (tanpa PIN). */
export async function listActiveStaff(): Promise<Array<{ id: string; name: string }>> {
  if (isPhoneClient()) {
    const res = await fetch('/api/staff');
    const body = await res.json();
    return body?.data ?? [];
  }
  if (Platform.OS === 'web') return []; // tabel staff hanya ada di HP utama
  const db = await getDB();
  return db.getAllAsync('SELECT id, name FROM staff WHERE active = 1 ORDER BY name');
}

// Data petugas hanya ada di SQLite HP utama. Perangkat staf (web dari server HP) mengelolanya
// lewat POST /api/staff-admin — PIN owner diverifikasi di HP pada setiap panggilan.
// Web online (Supabase) tidak punya data petugas.

async function staffAdmin(ownerPin: string, op: string, args: Record<string, any> = {}): Promise<any> {
  const res = await fetch('/api/staff-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerPin, op, ...args }),
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.error || 'Gagal');
  return body.data;
}

export async function listAllStaff(ownerPin = ''): Promise<StaffRow[]> {
  if (isPhoneClient()) return staffAdmin(ownerPin, 'list');
  return listAllStaffLocal();
}

export async function addStaff(name: string, pin: string, ownerPin = ''): Promise<void> {
  if (isPhoneClient()) return void await staffAdmin(ownerPin, 'add', { name, pin });
  return addStaffLocal(name, pin);
}

export async function setStaffActive(staff: StaffRow, active: boolean, ownerPin = ''): Promise<void> {
  if (isPhoneClient()) return void await staffAdmin(ownerPin, 'active', { id: staff.id, active });
  return setStaffActiveLocal(staff, active);
}

export async function resetStaffPin(staff: StaffRow, pin: string, ownerPin = ''): Promise<void> {
  if (isPhoneClient()) return void await staffAdmin(ownerPin, 'pin', { id: staff.id, pin });
  return resetStaffPinLocal(staff, pin);
}

// ─── Implementasi di HP utama (dipakai langsung & oleh /api/staff-admin) ──────

export async function listAllStaffLocal(): Promise<StaffRow[]> {
  const db = await getDB();
  return db.getAllAsync('SELECT id, name, active, created_at FROM staff ORDER BY active DESC, name');
}

function validPin(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN petugas harus 4–6 angka');
}

export async function addStaffLocal(name: string, pin: string, actor?: string): Promise<void> {
  const nm = String(name ?? '').trim();
  if (nm.length < 2) throw new Error('Nama petugas wajib diisi');
  validPin(pin);
  const db = await getDB();
  const dup = await db.getFirstAsync('SELECT id FROM staff WHERE lower(name) = lower(?)', nm);
  if (dup) throw new Error('Nama petugas sudah dipakai');
  const id = generateId();
  await db.runAsync('INSERT INTO staff (id, name, pin, active, created_at) VALUES (?, ?, ?, 1, ?)', id, nm, pin, new Date().toISOString());
  await logAudit('petugas_ubah', 'petugas', id, { name: nm, changes: { status: ['-', 'ditambahkan'] } }, actor);
}

export async function setStaffActiveLocal(staff: StaffRow, active: boolean, actor?: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE staff SET active = ? WHERE id = ?', active ? 1 : 0, staff.id);
  await logAudit('petugas_ubah', 'petugas', staff.id, {
    name: staff.name, changes: { status: [staff.active ? 'aktif' : 'nonaktif', active ? 'aktif' : 'nonaktif'] },
  }, actor);
}

export async function resetStaffPinLocal(staff: StaffRow, pin: string, actor?: string): Promise<void> {
  validPin(pin);
  const db = await getDB();
  await db.runAsync('UPDATE staff SET pin = ? WHERE id = ?', pin, staff.id);
  await logAudit('petugas_ubah', 'petugas', staff.id, { name: staff.name, changes: { pin: ['lama', 'baru'] } }, actor);
}
