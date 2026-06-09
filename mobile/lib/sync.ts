import { Platform } from 'react-native';
import { getDB } from './db';
import { supabase } from './supabase';
import { checkInternetConnection } from './networkUtils';

// ─── State ────────────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

let _status: SyncStatus = 'idle';
let _lastSync: Date | null = null;
let _isSyncing = false;
let _autoSyncTimer: ReturnType<typeof setInterval> | null = null;

// Listeners status sync (untuk UI widget)
const _listeners = new Set<(status: SyncStatus, lastSync: Date | null) => void>();

export function onSyncStatusChange(
  cb: (status: SyncStatus, lastSync: Date | null) => void
): () => void {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

// Listeners pull selesai (untuk refresh store setelah data baru masuk)
const _pullListeners = new Set<() => void>();

export function onPullComplete(cb: () => void): () => void {
  _pullListeners.add(cb);
  return () => _pullListeners.delete(cb);
}

function setStatus(s: SyncStatus) {
  _status = s;
  _listeners.forEach((cb) => cb(s, _lastSync));
}

export function getSyncStatus(): { status: SyncStatus; lastSync: Date | null } {
  return { status: _status, lastSync: _lastSync };
}

// ─── Push: SQLite → Supabase ──────────────────────────────────────────────────
// Hanya push orders pending. Menu & ingredients di-push langsung saat user ubah data
// (dari store), bukan di sini — agar tidak menimpa perubahan dari web/device lain.

export async function syncPendingOrders(): Promise<void> {
  if (Platform.OS === 'web') return;
  const db = await getDB();
  const pending = (await db.getAllAsync('SELECT * FROM orders WHERE synced = 0')) as any[];
  for (const order of pending) {
    try {
      const { error } = await supabase.from('orders').upsert(order);
      if (!error) {
        await db.runAsync('UPDATE orders SET synced = 1 WHERE id = ?', order.id);
      }
    } catch {
      // Skip order ini, coba lagi nanti
    }
  }
}

// Dipanggil langsung dari menuStore saat user create/update menu
export async function syncMenusToSupabase(): Promise<void> {
  if (Platform.OS === 'web') return;
  const db = await getDB();
  const menus = (await db.getAllAsync('SELECT * FROM menus')) as any[];
  if (menus.length === 0) return;
  const { error } = await supabase.from('menus').upsert(menus);
  if (error) console.warn('[sync] menus:', error.message);
}

// Dipanggil langsung dari stokStore saat user create/update ingredient
export async function syncIngredientsToSupabase(): Promise<void> {
  if (Platform.OS === 'web') return;
  const db = await getDB();
  const rows = (await db.getAllAsync('SELECT * FROM ingredients')) as any[];
  if (rows.length === 0) return;
  const { error } = await supabase.from('ingredients').upsert(rows);
  if (error) console.warn('[sync] ingredients:', error.message);
}

// ─── Pull: Supabase → SQLite ──────────────────────────────────────────────────

export async function pullFromSupabase(): Promise<void> {
  if (Platform.OS === 'web') return;
  const db = await getDB();

  // Categories
  const { data: cats, error: catErr } = await supabase.from('categories').select('*');
  if (!catErr) {
    for (const c of cats ?? []) {
      await db.runAsync(
        'INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)',
        c.id, c.name
      );
    }
  }

  // Menus — INSERT OR REPLACE agar perubahan nama/harga/gambar dari web/device lain masuk
  const { data: menus, error: menuErr } = await supabase.from('menus').select('*');
  if (!menuErr) {
    for (const m of menus ?? []) {
      await db.runAsync(
        `INSERT OR REPLACE INTO menus
           (id, name, category_id, sell_price, hpp, is_active, stock, image_uri, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        m.id, m.name, m.category_id, m.sell_price, m.hpp,
        m.is_active, m.stock, m.image_uri ?? null,
        m.created_at ?? new Date().toISOString()
      );
    }
  }

  // Ingredients
  const { data: ings, error: ingErr } = await supabase.from('ingredients').select('*');
  if (!ingErr) {
    for (const i of ings ?? []) {
      await db.runAsync(
        `INSERT OR REPLACE INTO ingredients
           (id, name, category, current_stock, unit, min_stock)
         VALUES (?, ?, ?, ?, ?, ?)`,
        i.id, i.name, i.category, i.current_stock, i.unit, i.min_stock
      );
    }
  }

  // Orders terbaru (100 terakhir) — INSERT OR REPLACE agar update status dari web masuk
  const { data: orders, error: orderErr } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (!orderErr) {
    for (const o of orders ?? []) {
      await db.runAsync(
        `INSERT OR REPLACE INTO orders
           (id, customer_id, table_no, status, payment_method,
            subtotal, tax, discount, total, note, synced, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        o.id, o.customer_id, o.table_no, o.status, o.payment_method,
        o.subtotal, o.tax, o.discount, o.total, o.note,
        o.created_at ?? new Date().toISOString()
      );
    }
  }

  // Bookings
  const { data: bookings } = await supabase.from('bookings').select('*').order('booking_date', { ascending: false }).limit(200);
  for (const b of bookings ?? []) {
    await db.runAsync(
      `INSERT OR REPLACE INTO bookings
         (id, customer_id, customer_name, booking_date, time, guests, table_type, purpose, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      b.id, b.customer_id ?? null, b.customer_name ?? null, b.booking_date,
      b.time, b.guests ?? 1, b.table_type ?? null, b.purpose ?? null, b.status ?? 'menunggu'
    );
  }

  // Stock movements
  const { data: movements } = await supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(500);
  for (const m of movements ?? []) {
    await db.runAsync(
      `INSERT OR IGNORE INTO stock_movements (id, ingredient_id, type, qty, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      m.id, m.ingredient_id ?? null, m.type, m.qty, m.note ?? null,
      m.created_at ?? new Date().toISOString()
    );
  }

  // Purchase orders
  const { data: pos } = await supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(100);
  for (const p of pos ?? []) {
    await db.runAsync(
      `INSERT OR REPLACE INTO purchase_orders (id, supplier_name, status, total, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      p.id, p.supplier_name, p.status ?? 'menunggu', p.total ?? 0,
      p.created_at ?? new Date().toISOString()
    );
  }

  // PO items
  const { data: poItems } = await supabase.from('po_items').select('*');
  for (const pi of poItems ?? []) {
    await db.runAsync(
      `INSERT OR IGNORE INTO po_items (id, po_id, ingredient_id, qty, unit, price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      pi.id, pi.po_id ?? null, pi.ingredient_id ?? null, pi.qty, pi.unit, pi.price
    );
  }

  // Beri tahu semua listener bahwa data baru sudah masuk ke SQLite
  _pullListeners.forEach((cb) => cb());
}

export async function syncPendingBookings(): Promise<void> {
  if (Platform.OS === 'web') return;
  const db = await getDB();
  const pending = (await db.getAllAsync('SELECT * FROM bookings WHERE synced = 0')) as any[];
  for (const b of pending) {
    try {
      const { error } = await supabase.from('bookings').upsert(b);
      if (!error) await db.runAsync('UPDATE bookings SET synced = 1 WHERE id = ?', b.id);
    } catch {}
  }
}

export async function syncPendingStockMovements(): Promise<void> {
  if (Platform.OS === 'web') return;
  const db = await getDB();
  const pending = (await db.getAllAsync('SELECT * FROM stock_movements WHERE synced = 0')) as any[];
  for (const m of pending) {
    try {
      const { error } = await supabase.from('stock_movements').upsert(m);
      if (!error) await db.runAsync('UPDATE stock_movements SET synced = 1 WHERE id = ?', m.id);
    } catch {}
  }
}

export async function syncPendingPurchaseOrders(): Promise<void> {
  if (Platform.OS === 'web') return;
  const db = await getDB();
  const pending = (await db.getAllAsync('SELECT * FROM purchase_orders WHERE synced = 0')) as any[];
  for (const po of pending) {
    try {
      const { error } = await supabase.from('purchase_orders').upsert(po);
      if (!error) {
        await db.runAsync('UPDATE purchase_orders SET synced = 1 WHERE id = ?', po.id);
        const items = (await db.getAllAsync('SELECT * FROM po_items WHERE po_id = ?', po.id)) as any[];
        if (items.length > 0) await supabase.from('po_items').upsert(items);
      }
    } catch {}
  }
}

// ─── syncAll ──────────────────────────────────────────────────────────────────

let _retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry() {
  if (_retryTimer) return;
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    syncAll().catch(() => {});
  }, 30_000);
}

export async function syncAll(): Promise<boolean> {
  if (_isSyncing) return false;

  const online = await checkInternetConnection();
  if (!online) {
    setStatus('offline');
    return false;
  }

  _isSyncing = true;
  setStatus('syncing');

  try {
    // 1. Pull dulu: ambil semua perubahan dari Supabase (web/device lain)
    await pullFromSupabase();

    // 2. Push data lokal yang belum tersinkron
    await syncPendingOrders();
    await syncPendingBookings();
    await syncPendingStockMovements();
    await syncPendingPurchaseOrders();

    _lastSync = new Date();
    setStatus('idle');
    return true;
  } catch (err) {
    console.warn('[sync] gagal:', err);
    setStatus('error');
    scheduleRetry();
    return false;
  } finally {
    _isSyncing = false;
  }
}

// ─── Auto-sync ────────────────────────────────────────────────────────────────

export function startAutoSync(intervalMs = 15_000): () => void {
  if (Platform.OS === 'web') return () => {};
  if (_autoSyncTimer) stopAutoSync();

  const firstRun = setTimeout(() => syncAll().catch(() => {}), 3_000);

  _autoSyncTimer = setInterval(() => {
    syncAll().catch(() => {});
  }, intervalMs);

  return () => {
    clearTimeout(firstRun);
    stopAutoSync();
  };
}

export function stopAutoSync(): void {
  if (_autoSyncTimer) {
    clearInterval(_autoSyncTimer);
    _autoSyncTimer = null;
  }
}
