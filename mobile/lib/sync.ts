import { Platform } from 'react-native';
import { getDB } from './db';
import { supabase } from './supabase';

// ─── Push: SQLite → Supabase ──────────────────────────────────────────────────

export async function syncPendingOrders() {
  if (Platform.OS === 'web') return;
  const db = await getDB();
  const pending = await db.getAllAsync<any>('SELECT * FROM orders WHERE synced = 0');
  for (const order of pending) {
    const { error } = await supabase.from('orders').upsert(order);
    if (!error) await db.runAsync('UPDATE orders SET synced = 1 WHERE id = ?', order.id);
  }
}

export async function syncMenusToSupabase() {
  if (Platform.OS === 'web') return;
  const db = await getDB();
  const menus = await db.getAllAsync<any>('SELECT * FROM menus');
  if (menus.length === 0) return;
  const { error } = await supabase.from('menus').upsert(menus);
  if (error) console.warn('Sync menus gagal:', error.message);
}

export async function syncIngredientsToSupabase() {
  if (Platform.OS === 'web') return;
  const db = await getDB();
  const rows = await db.getAllAsync<any>('SELECT * FROM ingredients');
  if (rows.length === 0) return;
  const { error } = await supabase.from('ingredients').upsert(rows);
  if (error) console.warn('Sync ingredients gagal:', error.message);
}

// ─── Pull: Supabase → SQLite ──────────────────────────────────────────────────

export async function pullFromSupabase() {
  if (Platform.OS === 'web') return;
  const db = await getDB();

  // Tarik categories
  const { data: cats } = await supabase.from('categories').select('*');
  for (const c of cats ?? []) {
    await db.runAsync(
      'INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)',
      c.id, c.name
    );
  }

  // Tarik menus
  const { data: menus } = await supabase.from('menus').select('*');
  for (const m of menus ?? []) {
    await db.runAsync(
      `INSERT OR REPLACE INTO menus (id, name, category_id, sell_price, hpp, is_active, stock, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      m.id, m.name, m.category_id, m.sell_price, m.hpp, m.is_active, m.stock,
      m.created_at ?? new Date().toISOString()
    );
  }

  // Tarik ingredients
  const { data: ings } = await supabase.from('ingredients').select('*');
  for (const i of ings ?? []) {
    await db.runAsync(
      `INSERT OR REPLACE INTO ingredients (id, name, category, current_stock, unit, min_stock)
       VALUES (?, ?, ?, ?, ?, ?)`,
      i.id, i.name, i.category, i.current_stock, i.unit, i.min_stock
    );
  }

  // Tarik orders (yang belum ada di lokal)
  const { data: orders } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(100);
  for (const o of orders ?? []) {
    await db.runAsync(
      `INSERT OR IGNORE INTO orders (id, customer_id, table_no, status, payment_method, subtotal, tax, discount, total, note, synced, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      o.id, o.customer_id, o.table_no, o.status, o.payment_method,
      o.subtotal, o.tax, o.discount, o.total, o.note,
      o.created_at ?? new Date().toISOString()
    );
  }
}

// ─── Sync semua ───────────────────────────────────────────────────────────────

export async function syncAll() {
  try {
    await syncPendingOrders();
    await syncMenusToSupabase();
    await syncIngredientsToSupabase();
  } catch (err) {
    console.warn('Sync gagal, akan dicoba lagi nanti:', err);
  }
}
