import { create } from 'zustand';
import { getDB, generateId } from '../lib/db';

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
    set({
      menus: rows.map((r) => ({
        id: r.id,
        name: r.name,
        categoryId: r.category_id,
        sellPrice: r.sell_price,
        hpp: r.hpp,
        isActive: r.is_active === 1,
        stock: r.stock,
        imageUri: r.image_uri ?? undefined,
        createdAt: r.created_at,
      })),
      loading: false,
    });
  },

  fetchCategories: async () => {
    const db = await getDB();
    const rows = await db.getAllAsync<Category>('SELECT * FROM categories ORDER BY name');
    set({ categories: rows });
  },

  createMenu: async (menu) => {
    const db = await getDB();
    const img = menu.imageUri ?? null;
    const sql = img !== null
      ? 'INSERT INTO menus (id, name, category_id, sell_price, hpp, is_active, stock, image_uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      : 'INSERT INTO menus (id, name, category_id, sell_price, hpp, is_active, stock) VALUES (?, ?, ?, ?, ?, ?, ?)';
    const args: any[] = [generateId(), menu.name, menu.categoryId, menu.sellPrice, menu.hpp, menu.isActive ? 1 : 0, menu.stock];
    if (img !== null) args.push(img);
    const result = await db.runAsync(sql, ...args);
    if (result?.error) throw new Error(result.error.message);
    await get().fetchMenus();
  },

  updateMenu: async (menu) => {
    const db = await getDB();
    const img = menu.imageUri ?? null;
    const sql = img !== null
      ? 'UPDATE menus SET name=?, category_id=?, sell_price=?, hpp=?, is_active=?, stock=?, image_uri=? WHERE id=?'
      : 'UPDATE menus SET name=?, category_id=?, sell_price=?, hpp=?, is_active=?, stock=? WHERE id=?';
    const args: any[] = [menu.name, menu.categoryId, menu.sellPrice, menu.hpp, menu.isActive ? 1 : 0, menu.stock];
    if (img !== null) args.push(img);
    args.push(menu.id);
    await db.runAsync(sql, ...args);
    await get().fetchMenus();
  },

  toggleActive: async (id) => {
    const db = await getDB();
    await db.runAsync(
      'UPDATE menus SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?',
      id
    );
    await get().fetchMenus();
  },
}));
