import { create } from 'zustand';

interface User {
  id: string;
  email: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: { id: '1', email: 'owner@umkm.com' },
  loading: false,
  checkSession: async () => set({ loading: false }),
  signIn: async () => null,
  signOut: async () => set({ user: null }),
}));