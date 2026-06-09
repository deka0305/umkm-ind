import { create } from 'zustand';
import { getDB, generateId } from '../lib/db';
import { syncIngredientsToSupabase } from '../lib/sync';

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
    set({ loading: true });
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
    await db.runAsync(
      'INSERT INTO ingredients (id, name, category, current_stock, unit, min_stock) VALUES (?, ?, ?, ?, ?, ?)',
      generateId(), ing.name, ing.category, ing.currentStock, ing.unit, ing.minStock
    );
    await get().fetchIngredients();
    syncIngredientsToSupabase().catch(() => {});
  },

  updateIngredient: async (ing) => {
    const db = await getDB();
    await db.runAsync(
      'UPDATE ingredients SET name=?, category=?, current_stock=?, unit=?, min_stock=? WHERE id=?',
      ing.name, ing.category, ing.currentStock, ing.unit, ing.minStock, ing.id
    );
    await get().fetchIngredients();
    syncIngredientsToSupabase().catch(() => {});
  },

  addMovement: async (ingredientId, type, qty, note = '') => {
    const db = await getDB();
    await db.runAsync(
      'INSERT INTO stock_movements (id, ingredient_id, type, qty, note, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
      generateId(), ingredientId, type, qty, note
    );
    const delta = type === 'masuk' ? qty : -qty;
    await db.runAsync(
      'UPDATE ingredients SET current_stock = current_stock + ? WHERE id = ?',
      delta, ingredientId
    );
    await get().fetchIngredients();
    syncIngredientsToSupabase().catch(() => {});
  },
}));
