import { Platform } from 'react-native';
import { create } from 'zustand';
import { getDB, generateId } from '../lib/db';
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

    let img: string | null = menu.imageUri ?? null;
    if (img && isLocalUri(img)) {
      const online = await checkInternetConnection();
      if (online) {
        const uploaded = await uploadMenuImage(img, id);
        if (uploaded) img = uploaded;
        else if (Platform.OS === 'web') img = null;
      } else if (Platform.OS === 'web') {
        img = null;
      }
    }

    if (Platform.OS === 'web') {
      const payload: Record<string, any> = {
        id, name: menu.name, category_id: menu.categoryId,
        sell_price: menu.sellPrice, hpp: menu.hpp,
        is_active: menu.isActive ? 1 : 0, stock: menu.stock,
      };
      if (img) payload.image_uri = img;
      console.log('[createMenu web] payload:', JSON.stringify({ ...payload, image_uri: img ? '[gambar]' : undefined }));
      let { error } = await supabase.from('menus').upsert(payload);
      if (error) {
        console.error('[createMenu web] upsert error:', error.code, error.message, error.details);
        // Fallback: jika error karena kolom image_uri, coba tanpa gambar
        if (img && (error.message.includes('image_uri') || error.code === '42703')) {
          const { image_uri: _removed, ...payloadNoImg } = payload;
          const res = await supabase.from('menus').upsert(payloadNoImg);
          error = res.error;
          if (error) console.error('[createMenu web] fallback error:', error.code, error.message);
        }
      }
      if (error) throw new Error(error.message);
    } else {
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

    let img: string | null = menu.imageUri ?? null;
    if (img && isLocalUri(img)) {
      const online = await checkInternetConnection();
      if (online) {
        const uploaded = await uploadMenuImage(img, menu.id);
        if (uploaded) img = uploaded;
        else if (Platform.OS === 'web') img = null;
      } else if (Platform.OS === 'web') {
        img = null;
      }
    }

    if (Platform.OS === 'web') {
      const payload: Record<string, any> = {
        name: menu.name, category_id: menu.categoryId,
        sell_price: menu.sellPrice, hpp: menu.hpp,
        is_active: menu.isActive ? 1 : 0, stock: menu.stock,
      };
      if (img !== null) payload.image_uri = img;
      let { error } = await supabase.from('menus').update(payload).eq('id', menu.id);
      // Fallback: jika kolom image_uri belum ada, retry tanpa gambar
      if (error && img !== null && (error.message.includes('image_uri') || error.code === '42703')) {
        const { image_uri: _removed, ...payloadNoImg } = payload;
        const res = await supabase.from('menus').update(payloadNoImg).eq('id', menu.id);
        error = res.error;
      }
      if (error) throw new Error(error.message);
    } else {
      // Android: update SQLite langsung (synced=0) → UI langsung update
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

    if (Platform.OS === 'web') {
      const { data } = await supabase.from('menus').select('is_active').eq('id', id).single();
      if (data) {
        const { error } = await supabase.from('menus').update({ is_active: !data.is_active }).eq('id', id);
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
