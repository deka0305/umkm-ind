import { Platform } from 'react-native';
import { create } from 'zustand';
import { getDB, generateId } from '../lib/db';
import { notifyDataChange } from '../lib/sync';
import { supabase } from '../lib/supabase';
import { checkInternetConnection } from '../lib/networkUtils';
import { logAudit } from '../lib/audit';

export interface Ingredient {
  id: string;
  name: string;
  category: string;
  currentStock: number;
  unit: string;
  minStock: number;
}

export type StokStatus = 'Aman' | 'Rendah' | 'Kritis' | 'Habis';

export function getStokStatus(current: number, min: number): StokStatus {
  if (current <= 0) return 'Habis';
  if (current <= min * 0.5) return 'Kritis';
  if (current <= min) return 'Rendah';
  return 'Aman';
}

interface StokState {
  ingredients: Ingredient[];
  loading: boolean;
  fetchIngredients: () => Promise<void>;
  createIngredient: (ing: Omit<Ingredient, 'id'>) => Promise<void>;
  updateIngredient: (ing: Ingredient) => Promise<void>;
  addMovement: (ingredientId: string, type: 'masuk' | 'keluar', qty: number, note?: string) => Promise<void>;
}

export const useStokStore = create<StokState>((set, get) => ({
  ingredients: [],
  loading: false,

  fetchIngredients: async () => {
    if (get().ingredients.length === 0) set({ loading: true });
    const db = await getDB();
    const rows = await db.getAllAsync<any>('SELECT * FROM ingredients ORDER BY name');
    set({
      ingredients: rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category ?? '',
        currentStock: r.current_stock,
        unit: r.unit,
        minStock: r.min_stock,
      })),
      loading: false,
    });
  },

  createIngredient: async (ing) => {
    const db = await getDB();
    const id = generateId();
    await db.runAsync(
      'INSERT INTO ingredients (id, name, category, current_stock, unit, min_stock) VALUES (?, ?, ?, ?, ?, ?)',
      id, ing.name, ing.category, ing.currentStock, ing.unit, ing.minStock
    );
    await get().fetchIngredients();
    notifyDataChange();
    if (Platform.OS !== 'web') {
      checkInternetConnection().then(async (online) => {
        if (!online) return;
        try {
          await supabase.from('ingredients').upsert({
            id, name: ing.name, category: ing.category,
            current_stock: ing.currentStock, unit: ing.unit, min_stock: ing.minStock,
          });
        } catch {}
      });
    }
  },

  updateIngredient: async (ing) => {
    const db = await getDB();
    const before = await db.getFirstAsync<any>('SELECT current_stock FROM ingredients WHERE id = ?', ing.id).catch(() => null);
    if (before && Number(before.current_stock) !== Number(ing.currentStock)) {
      // Stok diubah langsung tanpa catatan masuk/keluar — tandai untuk owner
      logAudit('stok_manual', 'bahan', ing.id, {
        name: ing.name, changes: { stok: [before.current_stock, ing.currentStock] },
      });
    }
    await db.runAsync(
      'UPDATE ingredients SET name=?, category=?, current_stock=?, unit=?, min_stock=? WHERE id=?',
      ing.name, ing.category, ing.currentStock, ing.unit, ing.minStock, ing.id
    );
    await get().fetchIngredients();
    notifyDataChange();
    if (Platform.OS !== 'web') {
      checkInternetConnection().then(async (online) => {
        if (!online) return;
        try {
          await supabase.from('ingredients').upsert({
            id: ing.id, name: ing.name, category: ing.category,
            current_stock: ing.currentStock, unit: ing.unit, min_stock: ing.minStock,
          });
        } catch {}
      });
    }
  },

  addMovement: async (ingredientId, type, qty, note = '') => {
    const db = await getDB();
    const movId = generateId();
    const now   = new Date().toISOString();
    await db.runAsync(
      'INSERT INTO stock_movements (id, ingredient_id, type, qty, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      movId, ingredientId, type, qty, note, now
    );
    const delta = type === 'masuk' ? qty : -qty;
    await db.runAsync(
      'UPDATE ingredients SET current_stock = current_stock + ? WHERE id = ?',
      delta, ingredientId
    );
    await get().fetchIngredients();
    notifyDataChange();
    if (Platform.OS !== 'web') {
      checkInternetConnection().then(async (online) => {
        if (!online) return;
        try {
          const row = await db.getFirstAsync('SELECT * FROM ingredients WHERE id = ?', ingredientId) as any;
          await Promise.all([
            supabase.from('stock_movements').upsert({
              id: movId, ingredient_id: ingredientId, type, qty, note, created_at: now,
            }),
            row ? supabase.from('ingredients').upsert(row) : Promise.resolve(),
          ]);
        } catch {}
      });
    }
  },
}));
