import { Platform } from 'react-native';
import { create } from 'zustand';
import { getDB, generateId } from '../lib/db';
import { useCartStore } from './cartStore';
import { notifyDataChange } from '../lib/sync';
import { supabase } from '../lib/supabase';
import { checkInternetConnection } from '../lib/networkUtils';
import { uploadMenuImage } from '../lib/imagePicker';

function isLocalUri(uri: string): boolean {
  return !uri.startsWith('http');
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
      isActive: r.is_active === 1,
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

    // Upload gambar ke Supabase Storage jika URI lokal dan online
    let img: string | null = menu.imageUri ?? null;
    if (img && isLocalUri(img)) {
      const online = await checkInternetConnection();
      if (online) {
        const uploaded = await uploadMenuImage(img, id);
        if (uploaded) {
          img = uploaded;
        } else if (Platform.OS === 'web') {
          img = null; // blob URL tidak bisa disimpan di Supabase
        }
      } else if (Platform.OS === 'web') {
        img = null; // offline di web: blob URL tidak persisten
      }
    }

    const sql = img !== null
      ? 'INSERT INTO menus (id, name, category_id, sell_price, hpp, is_active, stock, image_uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      : 'INSERT INTO menus (id, name, category_id, sell_price, hpp, is_active, stock) VALUES (?, ?, ?, ?, ?, ?, ?)';
    const args: any[] = [id, menu.name, menu.categoryId, menu.sellPrice, menu.hpp, menu.isActive ? 1 : 0, menu.stock];
    if (img !== null) args.push(img);
    const result = await db.runAsync(sql, ...args);
    if (result?.error) throw new Error(result.error.message);
    await get().fetchMenus();
    notifyDataChange();
    if (Platform.OS !== 'web') {
      checkInternetConnection().then(async (online) => {
        if (!online) return;
        try {
          await supabase.from('menus').upsert({
            id, name: menu.name, category_id: menu.categoryId,
            sell_price: menu.sellPrice, hpp: menu.hpp,
            is_active: menu.isActive ? 1 : 0, stock: menu.stock,
            image_uri: img,
          });
        } catch {}
      });
    }
  },

  updateMenu: async (menu) => {
    const db = await getDB();

    // Upload gambar ke Supabase Storage jika URI lokal dan online
    let img: string | null = menu.imageUri ?? null;
    if (img && isLocalUri(img)) {
      const online = await checkInternetConnection();
      if (online) {
        const uploaded = await uploadMenuImage(img, menu.id);
        if (uploaded) {
          img = uploaded;
        } else if (Platform.OS === 'web') {
          img = null; // blob URL tidak bisa disimpan di Supabase
        }
      } else if (Platform.OS === 'web') {
        img = null; // offline di web: blob URL tidak persisten
      }
    }

    const sql = img !== null
      ? 'UPDATE menus SET name=?, category_id=?, sell_price=?, hpp=?, is_active=?, stock=?, image_uri=? WHERE id=?'
      : 'UPDATE menus SET name=?, category_id=?, sell_price=?, hpp=?, is_active=?, stock=? WHERE id=?';
    const args: any[] = [menu.name, menu.categoryId, menu.sellPrice, menu.hpp, menu.isActive ? 1 : 0, menu.stock];
    if (img !== null) args.push(img);
    args.push(menu.id);
    await db.runAsync(sql, ...args);
    await get().fetchMenus();
    notifyDataChange();
    if (Platform.OS !== 'web') {
      checkInternetConnection().then(async (online) => {
        if (!online) return;
        try {
          await supabase.from('menus').upsert({
            id: menu.id, name: menu.name, category_id: menu.categoryId,
            sell_price: menu.sellPrice, hpp: menu.hpp,
            is_active: menu.isActive ? 1 : 0, stock: menu.stock,
            image_uri: img,
          });
        } catch {}
      });
    }
  },

  toggleActive: async (id) => {
    const db = await getDB();
    await db.runAsync(
      'UPDATE menus SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?',
      id
    );
    await get().fetchMenus();
    notifyDataChange();
    if (Platform.OS !== 'web') {
      checkInternetConnection().then(async (online) => {
        if (!online) return;
        try {
          const row = await db.getFirstAsync('SELECT * FROM menus WHERE id = ?', id) as any;
          if (row) await supabase.from('menus').upsert(row);
        } catch {}
      });
    }
  },
}));
