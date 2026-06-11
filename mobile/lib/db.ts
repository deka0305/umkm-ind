import { Platform } from 'react-native';
import { supabase } from './supabase';

export interface AppDB {
  getFirstAsync<T = any>(sql: string, ...params: any[]): Promise<T | null>;
  getAllAsync<T = any>(sql: string, ...params: any[]): Promise<T[]>;
  runAsync(sql: string, ...params: any[]): Promise<any>;
  execAsync(sql: string): Promise<any>;
}

let _db: AppDB | null = null;

export async function getDB(): Promise<AppDB> {
  if (_db) return _db;

  if (Platform.OS === 'web') {
    _db = new SupabaseDB();
    return _db;
  }

  const SQLite = await import('expo-sqlite');
  _db = await SQLite.openDatabaseAsync('umkm.db');
  await initSchema(_db);
  return _db;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── SQLite schema (native only) ─────────────────────────────────────────────

async function initSchema(db: AppDB) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS menus (id TEXT PRIMARY KEY, name TEXT NOT NULL, category_id TEXT, sell_price REAL NOT NULL DEFAULT 0, hpp REAL NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, stock INTEGER NOT NULL DEFAULT 0, image_uri TEXT, synced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS ingredients (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, current_stock REAL NOT NULL DEFAULT 0, unit TEXT NOT NULL, min_stock REAL NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS stock_movements (id TEXT PRIMARY KEY, ingredient_id TEXT, type TEXT NOT NULL, qty REAL NOT NULL, note TEXT, synced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, member_tier TEXT NOT NULL DEFAULT 'Bronze', total_orders INTEGER NOT NULL DEFAULT 0, total_spent REAL NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, customer_id TEXT, table_no TEXT, status TEXT NOT NULL DEFAULT 'pending', payment_method TEXT, subtotal REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, note TEXT, synced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, order_id TEXT, menu_id TEXT, qty INTEGER NOT NULL, price REAL NOT NULL, subtotal REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, customer_id TEXT, customer_name TEXT, booking_date TEXT NOT NULL, time TEXT NOT NULL, guests INTEGER NOT NULL DEFAULT 1, table_type TEXT, purpose TEXT, status TEXT NOT NULL DEFAULT 'menunggu', synced INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS purchase_orders (id TEXT PRIMARY KEY, supplier_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'menunggu', total REAL NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS po_items (id TEXT PRIMARY KEY, po_id TEXT, ingredient_id TEXT, qty REAL NOT NULL, unit TEXT NOT NULL, price REAL NOT NULL, synced INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO categories (id, name) VALUES ('cat-1','Makanan Berat'),('cat-2','Makanan Ringan'),('cat-3','Minuman'),('cat-4','Dessert');
  `);
  // Migrate existing tables — safe to ignore if column already exists
  try { await db.execAsync('ALTER TABLE bookings ADD COLUMN customer_name TEXT'); } catch {}
  try { await db.execAsync('ALTER TABLE menus ADD COLUMN image_uri TEXT'); } catch {}
  try { await db.execAsync('ALTER TABLE menus ADD COLUMN synced INTEGER NOT NULL DEFAULT 0'); } catch {}
}

// ─── localStorage fallback (web) ─────────────────────────────────────────────
// Dipakai saat tabel Supabase belum dibuat (404). Data tersimpan di browser.

function lsKey(table: string) { return `umkm_${table}`; }

function lsGetAll(table: string): any[] {
  try { return JSON.parse(localStorage.getItem(lsKey(table)) ?? '[]'); }
  catch { return []; }
}

function lsSave(table: string, obj: Record<string, any>): void {
  const rows = lsGetAll(table);
  const idx = rows.findIndex((r) => r.id === obj.id);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...obj };
  else rows.push(obj);
  try { localStorage.setItem(lsKey(table), JSON.stringify(rows)); } catch {}
}

function lsUpdate(table: string, updates: Record<string, any>, whereCol: string, whereVal: any): void {
  const rows = lsGetAll(table).map((r) => r[whereCol] === whereVal ? { ...r, ...updates } : r);
  try { localStorage.setItem(lsKey(table), JSON.stringify(rows)); } catch {}
}

// Tabel yang belum ada di Supabase (fallback ke localStorage)
const LS_TABLES = new Set<string>();

// ─── Supabase DB Adapter (web) ────────────────────────────────────────────────

class SupabaseDB {
  // no-op: schema is managed in Supabase dashboard
  async execAsync(): Promise<void> {}

  async getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]> {
    const upper = sql.toUpperCase();

    // ── Revenue by date (GROUP BY + date() from orders) ──────────────────────
    if (upper.includes('GROUP BY') && upper.includes('DATE(CREATED_AT)') && upper.includes('FROM ORDERS')) {
      const { data: orders } = await supabase.from('orders').select('*');
      let rows = (orders ?? []).filter((r) => r.status === 'selesai');
      if (params.length >= 2) {
        const [start, end] = params as string[];
        rows = rows.filter((r) => {
          const d = (r.created_at ?? '').slice(0, 10);
          return d >= start && d <= end;
        });
      }
      const grouped: Record<string, { tgl: string; revenue: number; jml_order: number }> = {};
      for (const r of rows) {
        const tgl = (r.created_at ?? '').slice(0, 10);
        if (!tgl) continue;
        if (!grouped[tgl]) grouped[tgl] = { tgl, revenue: 0, jml_order: 0 };
        grouped[tgl].revenue += r.total ?? 0;
        grouped[tgl].jml_order += 1;
      }
      return Object.values(grouped).sort((a, b) => a.tgl.localeCompare(b.tgl)) as T[];
    }

    // ── Top menus (JOIN order_items + menus + orders) ─────────────────────────
    if (upper.includes('GROUP BY') && upper.includes('JOIN MENUS') && upper.includes('JOIN ORDERS')) {
      const [{ data: orderItems }, { data: menus }, { data: orders }] = await Promise.all([
        supabase.from('order_items').select('*'),
        supabase.from('menus').select('*'),
        supabase.from('orders').select('*'),
      ]);
      const menuMap: Record<string, string> = {};
      for (const m of menus ?? []) menuMap[m.id] = m.name;

      let validOrders = (orders ?? []).filter((o) => o.status === 'selesai');
      if (params.length >= 2) {
        const [start, end] = params as string[];
        validOrders = validOrders.filter((o) => {
          const d = (o.created_at ?? '').slice(0, 10);
          return d >= start && d <= end;
        });
      }
      const validIds = new Set(validOrders.map((o) => o.id));

      const grouped: Record<string, { name: string; qty: number; revenue: number }> = {};
      for (const oi of orderItems ?? []) {
        if (!validIds.has(oi.order_id)) continue;
        const mid = oi.menu_id;
        if (!grouped[mid]) grouped[mid] = { name: menuMap[mid] ?? 'Unknown', qty: 0, revenue: 0 };
        grouped[mid].qty += oi.qty ?? 0;
        grouped[mid].revenue += oi.subtotal ?? 0;
      }
      const limitMatch2 = sql.match(/LIMIT\s+(\d+)/i);
      const lim = limitMatch2 ? parseInt(limitMatch2[1]) : 999;
      return Object.values(grouped).sort((a, b) => b.qty - a.qty).slice(0, lim) as T[];
    }

    // ── Bookings (fallback ke localStorage kalau Supabase 404) ───────────────
    if (upper.includes('FROM BOOKINGS')) {
      const { data, error } = await supabase.from('bookings').select('*');
      let rows: any[];
      if (error) {
        rows = lsGetAll('bookings'); // localStorage fallback
      } else {
        rows = data ?? [];
      }
      rows = rows.sort((a, b) => (b.booking_date ?? '').localeCompare(a.booking_date ?? ''));
      const limitM = sql.match(/LIMIT\s+(\d+)/i);
      if (limitM) rows = rows.slice(0, parseInt(limitM[1]));
      return rows.map((r: any) => ({ ...r, customer_name: r.customer_name ?? 'Tamu' })) as T[];
    }

    const table = getTable(sql);
    if (!table) return [];

    // Tabel yang fallback ke localStorage bila belum ada di Supabase
    if (LS_TABLES.has(table)) {
      const { data, error } = await supabase.from(table).select('*');
      if (error) return lsGetAll(table) as T[];
      return (data ?? []) as T[];
    }

    const { data, error } = await supabase.from(table).select('*');
    if (error) { console.warn(`Supabase getAllAsync [${table}]: ${error.message}`); return []; }

    let rows: any[] = data ?? [];

    if (table === 'categories' && rows.length === 0) {
      const defaults = [
        { id: 'cat-1', name: 'Makanan Berat' },
        { id: 'cat-2', name: 'Makanan Ringan' },
        { id: 'cat-3', name: 'Minuman' },
        { id: 'cat-4', name: 'Dessert' },
      ];
      await supabase.from('categories').upsert(defaults);
      rows = defaults;
    }

    // WHERE current_stock <= min_stock (stok kritis)
    if (sql.includes('current_stock <= min_stock')) {
      rows = rows.filter((r) => r.current_stock <= r.min_stock);
    }

    // Simple WHERE col = ? with params
    const whereSimple = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
    if (whereSimple && params.length > 0) {
      const col = whereSimple[1];
      rows = rows.filter((r) => r[col] === params[0]);
    }

    // ORDER BY
    const orderMatch = sql.match(/ORDER BY\s+(\w+)(\s+DESC)?/i);
    if (orderMatch) {
      const field = orderMatch[1];
      const desc = !!orderMatch[2];
      rows.sort((a, b) => {
        const av = a[field] ?? '';
        const bv = b[field] ?? '';
        if (av < bv) return desc ? 1 : -1;
        if (av > bv) return desc ? -1 : 1;
        return 0;
      });
    }

    // LIMIT
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) rows = rows.slice(0, parseInt(limitMatch[1]));

    return rows as T[];
  }

  async getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null> {
    // Aggregate: COUNT + SUM untuk orders
    if (/COUNT|SUM/i.test(sql)) {
      const table = getTable(sql);
      if (!table) return null;

      const { data } = await supabase.from(table).select('*');
      let rows: any[] = data ?? [];

      // Filter status AND (optionally) date
      if (sql.includes("status='selesai'") && params[0]) {
        rows = rows.filter(
          (r) => r.status === 'selesai' && (r.created_at ?? '').startsWith(params[0])
        );
      } else if (sql.includes("status='selesai'")) {
        rows = rows.filter((r) => r.status === 'selesai');
      } else if (sql.includes("status='pending'")) {
        rows = rows.filter((r) => r.status === 'pending');
      }

      return {
        cnt: rows.length,
        rev: rows.reduce((s, r) => s + (r.total ?? 0), 0),
      } as T;
    }

    const rows = await this.getAllAsync<T>(sql, ...params);
    return rows[0] ?? null;
  }

  async runAsync(sql: string, ...params: any[]): Promise<{ error?: any }> {
    const upper = sql.trim().toUpperCase();

    if (upper.startsWith('INSERT')) {
      const tableMatch = sql.match(/INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+(\w+)/i);
      const colMatch = sql.match(/\(([^)]+)\)\s+VALUES/i);
      if (!tableMatch || !colMatch) return {};

      const table = tableMatch[1];
      const cols = colMatch[1].split(',').map((c) => c.trim());
      const valMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
      const valTokens = valMatch ? valMatch[1].split(',').map((v) => v.trim()) : [];
      const obj: Record<string, any> = {};
      let pi = 0;
      cols.forEach((col, i) => {
        const tok = valTokens[i] ?? '?';
        if (tok === '?') {
          obj[col] = params[pi++] ?? null;
        } else if (/^'.*'$/.test(tok)) {
          obj[col] = tok.slice(1, -1);
        } else if (tok.toLowerCase().includes('datetime') || tok.toLowerCase().includes('now')) {
          obj[col] = new Date().toISOString();
        } else if (!isNaN(Number(tok))) {
          obj[col] = Number(tok);
        }
      });

      // Strip null values — prevents "column does not exist" errors for optional columns
      // Convert is_active 0/1 to boolean for Supabase compatibility
      const upsertObj = Object.fromEntries(
        Object.entries(obj)
          .filter(([, v]) => v !== null)
          .map(([k, v]) => [k, k === 'is_active' && (v === 0 || v === 1) ? v === 1 : v])
      );
      const { error } = await supabase.from(table).upsert(upsertObj);
      if (error) {
        if (LS_TABLES.has(table)) {
          lsSave(table, obj); // localStorage fallback
          return {};
        }
        console.error('Supabase insert:', error.message);
        return { error };
      }

    } else if (upper.startsWith('UPDATE')) {
      const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
      if (!tableMatch) return {};
      const table = tableMatch[1];

      // Toggle is_active
      if (sql.includes('CASE WHEN')) {
        const id = params[0];
        const { data } = await supabase.from(table).select('is_active').eq('id', id).single();
        if (data) {
          await supabase.from(table).update({ is_active: !data.is_active }).eq('id', id);
        }
        return {};
      }

      // General UPDATE: SET col=?,col=? WHERE id=?
      const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/is);
      const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
      if (!setMatch || !whereMatch) return {};

      const setCols = setMatch[1].split(',').map((c) => c.trim().split(/\s*=\s*/)[0].trim());
      const whereCol = whereMatch[1];
      const whereVal = params[params.length - 1];

      const obj: Record<string, any> = {};
      setCols.forEach((col, i) => { obj[col] = params[i] ?? null; });

      // Strip null values — prevents "column does not exist" errors for optional columns
      const updateObj = Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null));
      const { error } = await supabase.from(table).update(updateObj).eq(whereCol, whereVal);
      if (error) {
        if (LS_TABLES.has(table)) {
          lsUpdate(table, obj, whereCol, whereVal); // localStorage fallback
        } else {
          console.error('Supabase update:', error.message);
        }
      }

    } else if (upper.startsWith('DELETE')) {
      const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
      const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
      if (!tableMatch || !whereMatch) return {};

      const { error } = await supabase.from(tableMatch[1]).delete().eq(whereMatch[1], params[0]);
      if (error) console.error('Supabase delete:', error.message);
    }
    return {};
  }
}

export async function resetAllData(): Promise<void> {
  // Hapus dari Supabase di semua platform (native + web)
  const tables = [
    'po_items', 'purchase_orders', 'order_items', 'orders', 'bookings',
    'stock_movements', 'customers', 'ingredients', 'menus',
  ];
  for (const table of tables) {
    await supabase.from(table).delete().neq('id', '');
  }
  await supabase.from('categories').upsert([
    { id: 'cat-1', name: 'Makanan Berat' },
    { id: 'cat-2', name: 'Makanan Ringan' },
    { id: 'cat-3', name: 'Minuman' },
    { id: 'cat-4', name: 'Dessert' },
  ]);

  if (Platform.OS !== 'web') {
    // Hapus juga SQLite lokal di Android/iOS
    const db = await getDB();
    await db.execAsync(`
      DELETE FROM po_items;
      DELETE FROM purchase_orders;
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM bookings;
      DELETE FROM stock_movements;
      DELETE FROM customers;
      DELETE FROM ingredients;
      DELETE FROM menus;
      DELETE FROM categories;
      INSERT OR IGNORE INTO categories (id, name) VALUES
        ('cat-1','Makanan Berat'),('cat-2','Makanan Ringan'),
        ('cat-3','Minuman'),('cat-4','Dessert');
    `);
  } else {
    // Bersihkan localStorage fallback di web
    const lsTables = [
      'bookings', 'po_items', 'purchase_orders', 'order_items', 'orders',
      'stock_movements', 'customers', 'ingredients', 'menus',
    ];
    for (const t of lsTables) {
      try { localStorage.removeItem(`umkm_${t}`); } catch {}
    }
  }
}

function getTable(sql: string): string {
  const match = sql.match(/FROM\s+(\w+)/i);
  return match?.[1] ?? '';
}
