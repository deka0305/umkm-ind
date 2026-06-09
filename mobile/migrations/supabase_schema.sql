-- ============================================================
--  UMKM Pro — Supabase Schema Migration
--  Jalankan di: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- 1. Kategori menu
CREATE TABLE IF NOT EXISTS categories (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- 2. Menu produk
CREATE TABLE IF NOT EXISTS menus (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  category_id TEXT,
  sell_price  REAL NOT NULL DEFAULT 0,
  hpp         REAL NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  stock       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Bahan baku / stok
CREATE TABLE IF NOT EXISTS ingredients (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT,
  current_stock REAL NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL,
  min_stock     REAL NOT NULL DEFAULT 0
);

-- 4. Pergerakan stok
CREATE TABLE IF NOT EXISTS stock_movements (
  id            TEXT PRIMARY KEY,
  ingredient_id TEXT,
  type          TEXT NOT NULL,
  qty           REAL NOT NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Customer / pelanggan
CREATE TABLE IF NOT EXISTS customers (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  phone        TEXT,
  member_tier  TEXT NOT NULL DEFAULT 'Bronze',
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spent  REAL NOT NULL DEFAULT 0
);

-- 6. Order transaksi
CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  customer_id    TEXT,
  table_no       TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  subtotal       REAL NOT NULL DEFAULT 0,
  tax            REAL NOT NULL DEFAULT 0,
  discount       REAL NOT NULL DEFAULT 0,
  total          REAL NOT NULL DEFAULT 0,
  note           TEXT,
  synced         INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Item dalam order
CREATE TABLE IF NOT EXISTS order_items (
  id       TEXT PRIMARY KEY,
  order_id TEXT,
  menu_id  TEXT,
  qty      INTEGER NOT NULL,
  price    REAL NOT NULL,
  subtotal REAL NOT NULL
);

-- 8. Booking reservasi  ← tabel yang error
CREATE TABLE IF NOT EXISTS bookings (
  id            TEXT PRIMARY KEY,
  customer_id   TEXT,
  customer_name TEXT,
  booking_date  TEXT NOT NULL,
  time          TEXT NOT NULL,
  guests        INTEGER NOT NULL DEFAULT 1,
  table_type    TEXT,
  purpose       TEXT,
  status        TEXT NOT NULL DEFAULT 'menunggu'
);

-- 9. Purchase Order ke supplier
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            TEXT PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'menunggu',
  total         REAL NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Item dalam PO
CREATE TABLE IF NOT EXISTS po_items (
  id            TEXT PRIMARY KEY,
  po_id         TEXT,
  ingredient_id TEXT,
  qty           REAL NOT NULL,
  unit          TEXT NOT NULL,
  price         REAL NOT NULL
);

-- ── Seed data default ─────────────────────────────────────
INSERT INTO categories (id, name) VALUES
  ('cat-1', 'Makanan Berat'),
  ('cat-2', 'Makanan Ringan'),
  ('cat-3', 'Minuman'),
  ('cat-4', 'Dessert')
ON CONFLICT (id) DO NOTHING;

INSERT INTO menus (id, name, category_id, sell_price, hpp, is_active, stock) VALUES
  ('menu-1',  'Nasi Goreng Spesial',    'cat-1', 18000,  9000, 1, 50),
  ('menu-2',  'Ayam Bakar Madu',        'cat-1', 25000, 13000, 1, 30),
  ('menu-3',  'Mie Goreng Seafood',     'cat-1', 20000, 10500, 1, 40),
  ('menu-4',  'Soto Ayam Kampung',      'cat-1', 15000,  7000, 1, 35),
  ('menu-5',  'Nasi Uduk Komplit',      'cat-1', 22000, 11000, 1, 20),
  ('menu-6',  'Tempe Mendoan',          'cat-2',  8000,  3500, 1, 60),
  ('menu-7',  'Bakwan Sayur',           'cat-2',  6000,  2500, 1, 80),
  ('menu-8',  'Pisang Goreng Crispy',   'cat-2', 10000,  4000, 1, 45),
  ('menu-9',  'Risoles Mayo',           'cat-2',  9000,  4000, 1, 55),
  ('menu-10', 'Es Teh Manis',           'cat-3',  5000,  1500, 1,100),
  ('menu-11', 'Es Jeruk Peras',         'cat-3',  8000,  2800, 1, 80),
  ('menu-12', 'Kopi Susu Gula Aren',    'cat-3', 15000,  5500, 1, 60),
  ('menu-13', 'Jus Alpukat',            'cat-3', 18000,  7000, 1, 40),
  ('menu-14', 'Es Teler',              'cat-3', 12000,  4500, 1, 50),
  ('menu-15', 'Puding Cokelat',         'cat-4', 10000,  4000, 1, 25),
  ('menu-16', 'Es Campur',              'cat-4', 12000,  5000, 1, 20),
  ('menu-17', 'Klepon',                 'cat-4',  8000,  3000, 1, 30),
  ('menu-18', 'Serabi Notosuman',       'cat-4',  9000,  3500, 1, 35)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ingredients (id, name, category, current_stock, unit, min_stock) VALUES
  ('ing-1', 'Beras',          'Bahan Baku',  25, 'kg',    5),
  ('ing-2', 'Ayam',           'Protein',      8, 'kg',    3),
  ('ing-3', 'Minyak Goreng',  'Bumbu',        5, 'liter', 2),
  ('ing-4', 'Telur',          'Protein',      2, 'kg',    5),
  ('ing-5', 'Kopi Arabika',   'Minuman',      1, 'kg',    1),
  ('ing-6', 'Gula Pasir',     'Bumbu',        3, 'kg',    2),
  ('ing-7', 'Tepung Terigu',  'Bahan Baku',   4, 'kg',    3)
ON CONFLICT (id) DO NOTHING;
