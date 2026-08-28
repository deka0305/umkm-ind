import { Platform } from 'react-native';
import { create } from 'zustand';
import { getDB, generateId, isPhoneClient } from '../lib/db';
import { useCartStore } from './cartStore';
import { notifyDataChange } from '../lib/sync';
import { supabase } from '../lib/supabase';
import { checkInternetConnection } from '../lib/networkUtils';
import { uploadMenuImage } from '../lib/imagePicker';

function isLocalUri(uri: string): boolean {
  // Hanya URL https:// yang sudah di-upload (Supabase Storage) yang dianggap remote
  // blob:, data:, file:, http://localhost → masih lokal, perlu diupload
  return !uri.startsWith('https://');
}

export interface Menu {
  id: string;
  name: string;
  categoryId: string;
  sellPrice: number;
  hpp: number;
  isActive: boolean;
  stock: number;
  imageUri?: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
}

interface MenuState {
  menus: Menu[];
  categories: Category[];
  loading: boolean;
  fetchMenus: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  createMenu: (menu: Omit<Menu, 'id' | 'createdAt'>) => Promise<void>;
  updateMenu: (menu: Menu) => Promise<void>;
  toggleActive: (id: string) => Promise<void>;
}

export const useMenuStore = create<MenuState>((set, get) => ({
  menus: [],
  categories: [],
  loading: false,

  fetchMenus: async () => {
    set({ loading: true });
    const db = await getDB();
    const rows = await db.getAllAsync<any>('SELECT * FROM menus ORDER BY name');
    const menus = rows.map((r) => ({
      id: r.id,
      name: r.name,
      categoryId: r.category_id,
      sellPrice: r.sell_price,
      hpp: r.hpp,
      isActive: !!r.is_active,
      stock: r.stock,
      imageUri: r.image_uri ?? undefined,
      createdAt: r.created_at,
    }));
    set({ menus, loading: false });
    useCartStore.getState().syncPrices(menus);
  },

  fetchCategories: async () => {
    const db = await getDB();
    const rows = await db.getAllAsync<Category>('SELECT * FROM categories ORDER BY name');
    set({ categories: rows });
  },

  createMenu: async (menu) => {
    const db = await getDB();
    const id  = generateId();

    if (Platform.OS === 'web' && !isPhoneClient()) {
      // ── Web: simpan menu dulu TANPA gambar → respond langsung ke user ──────
      // Upload gambar dijalankan di background setelah save berhasil.
      const payload = {
        id, name: menu.name, category_id: menu.categoryId,
        sell_price: menu.sellPrice, hpp: menu.hpp,
        is_active: menu.isActive ? 1 : 0, stock: menu.stock,
      };
      const { error } = await supabase.from('menus').upsert(payload);
      if (error) throw new Error(error.message);

      // Background upload — tidak blocking, UI sudah bisa jalan
      const localImg = menu.imageUri ?? null;
      if (localImg && isLocalUri(localImg)) {
        Promise.race<string | null>([
          uploadMenuImage(localImg, id).catch(() => null),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 30_000)),
        ]).then(async (uploaded) => {
          if (!uploaded) return;
          try { await supabase.from('menus').update({ image_uri: uploaded }).eq('id', id); } catch {}
          get().fetchMenus().catch(() => {});
          notifyDataChange();
        }).catch(() => {});
      }
    } else {
      // ── Android: existing logic ───────────────────────────────────────────
      let img: string | null = menu.imageUri ?? null;
      if (img && isLocalUri(img)) {
        const online = await checkInternetConnection();
        if (online) img = await uploadMenuImage(img, id).catch(() => null);
        else img = null;
      }
      // Android: tulis ke SQLite dulu (synced=0) → UI langsung update
      const sql = img !== null
        ? 'INSERT INTO menus (id, name, category_id, sell_price, hpp, is_active, stock, image_uri, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)'
        : 'INSERT INTO menus (id, name, category_id, sell_price, hpp, is_active, stock, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 0)';
      const args: any[] = [id, menu.name, menu.categoryId, menu.sellPrice, menu.hpp, menu.isActive ? 1 : 0, menu.stock];
      if (img !== null) args.push(img);
      const result = await db.runAsync(sql, ...args);
      if (result?.error) throw new Error(result.error.message);
      // Sync ke Supabase di background (tidak blocking UI)
      // Jika gagal/offline → pushPendingAll akan retry tiap 3 detik secara otomatis
      checkInternetConnection().then(async (online) => {
        if (!online) return;
        try {
          const { error } = await supabase.from('menus').upsert({
            id, name: menu.name, category_id: menu.categoryId,
            sell_price: menu.sellPrice, hpp: menu.hpp,
            is_active: menu.isActive ? 1 : 0, stock: menu.stock,
            image_uri: img,
          });
          if (!error) await db.runAsync('UPDATE menus SET synced = 1 WHERE id = ?', id);
        } catch {}
      });
    }
    await get().fetchMenus();
    notifyDataChange();
  },

  updateMenu: async (menu) => {
    const db = await getDB();

    if (Platform.OS === 'web' && !isPhoneClient()) {
      // ── Web: update menu dulu TANPA gambar baru → respond langsung ──────────
      // Jika image_uri sudah https:// (dari Supabase Storage), tetap disimpan.
      const existingImg = (menu.imageUri && !isLocalUri(menu.imageUri)) ? menu.imageUri : null;
      const payload: Record<string, any> = {
        name: menu.name, category_id: menu.categoryId,
        sell_price: menu.sellPrice, hpp: menu.hpp,
        is_active: menu.isActive ? 1 : 0, stock: menu.stock,
      };
      if (existingImg) payload.image_uri = existingImg;
      const { error } = await supabase.from('menus').update(payload).eq('id', menu.id);
      if (error) throw new Error(error.message);

      // Background upload jika ada gambar lokal baru
      const localImg = (menu.imageUri && isLocalUri(menu.imageUri)) ? menu.imageUri : null;
      if (localImg) {
        const menuId = menu.id;
        Promise.race<string | null>([
          uploadMenuImage(localImg, menuId).catch(() => null),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 30_000)),
        ]).then(async (uploaded) => {
          if (!uploaded) return;
          try { await supabase.from('menus').update({ image_uri: uploaded }).eq('id', menuId); } catch {}
          get().fetchMenus().catch(() => {});
          notifyDataChange();
        }).catch(() => {});
      }
    } else {
      // Android: resolve img dulu (upload jika lokal)
      let img: string | null = menu.imageUri ?? null;
      if (img && isLocalUri(img)) {
        const online = await checkInternetConnection();
        if (online) img = await uploadMenuImage(img, menu.id).catch(() => null);
        else img = null;
      }
      // Update SQLite langsung (synced=0) → UI langsung update
      const sql = img !== null
        ? 'UPDATE menus SET name=?, category_id=?, sell_price=?, hpp=?, is_active=?, stock=?, image_uri=?, synced=0 WHERE id=?'
        : 'UPDATE menus SET name=?, category_id=?, sell_price=?, hpp=?, is_active=?, stock=?, synced=0 WHERE id=?';
      const args: any[] = [menu.name, menu.categoryId, menu.sellPrice, menu.hpp, menu.isActive ? 1 : 0, menu.stock];
      if (img !== null) args.push(img);
      args.push(menu.id);
      await db.runAsync(sql, ...args);
      checkInternetConnection().then(async (online) => {
        if (!online) return;
        try {
          const { error } = await supabase.from('menus').upsert({
            id: menu.id, name: menu.name, category_id: menu.categoryId,
            sell_price: menu.sellPrice, hpp: menu.hpp,
            is_active: menu.isActive ? 1 : 0, stock: menu.stock,
            image_uri: img,
          });
          if (!error) await db.runAsync('UPDATE menus SET synced = 1 WHERE id = ?', menu.id);
        } catch {}
      });
    }
    await get().fetchMenus();
    notifyDataChange();
  },

  toggleActive: async (id) => {
    const db = await getDB();

    if (Platform.OS === 'web' && !isPhoneClient()) {
      const { data } = await supabase.from('menus').select('is_active').eq('id', id).single();
      if (data) {
        // is_active bertipe integer di Postgres — kirim 1/0, bukan boolean
        const { error } = await supabase.from('menus').update({ is_active: data.is_active ? 0 : 1 }).eq('id', id);
        if (error) throw new Error(error.message);
      }
    } else {
      // Android: toggle di SQLite + tandai perlu sync
      await db.runAsync(
        'UPDATE menus SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, synced = 0 WHERE id = ?',
        id
      );
      checkInternetConnection().then(async (online) => {
        if (!online) return;
        try {
          const row = await db.getFirstAsync<any>('SELECT * FROM menus WHERE id = ?', id);
          if (row) {
            const { synced: _, ...rowData } = row; // exclude kolom lokal `synced`
            const { error } = await supabase.from('menus').upsert({
              ...rowData,
              is_active: row.is_active === 1 ? 1 : 0,
            });
            if (!error) await db.runAsync('UPDATE menus SET synced = 1 WHERE id = ?', id);
          }
        } catch {}
      });
    }
    await get().fetchMenus();
    notifyDataChange();
  },
}));
