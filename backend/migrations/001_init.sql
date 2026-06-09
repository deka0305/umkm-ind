CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menus (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  sell_price REAL NOT NULL DEFAULT 0,
  hpp REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  stock INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hpp_ingredients (
  id TEXT PRIMARY KEY,
  menu_id TEXT REFERENCES menus(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  qty REAL NOT NULL,
  unit TEXT NOT NULL,
  price_per_unit REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS hpp_production_costs (
  id TEXT PRIMARY KEY,
  menu_id TEXT REFERENCES menus(id) ON DELETE CASCADE,
  gas_cost REAL NOT NULL DEFAULT 0,
  packaging_cost REAL NOT NULL DEFAULT 0,
  other_cost REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  current_stock REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  min_stock REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  ingredient_id TEXT REFERENCES ingredients(id),
  type TEXT NOT NULL,
  qty REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  member_tier TEXT NOT NULL DEFAULT 'Bronze',
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spent REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  table_no TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  note TEXT,
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
  menu_id TEXT REFERENCES menus(id),
  qty INTEGER NOT NULL,
  price REAL NOT NULL,
  subtotal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  booking_date TEXT NOT NULL,
  time TEXT NOT NULL,
  guests INTEGER NOT NULL,
  table_type TEXT,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'menunggu'
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'menunggu',
  total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS po_items (
  id TEXT PRIMARY KEY,
  po_id TEXT REFERENCES purchase_orders(id) ON DELETE CASCADE,
  ingredient_id TEXT REFERENCES ingredients(id),
  qty REAL NOT NULL,
  unit TEXT NOT NULL,
  price REAL NOT NULL
);

INSERT OR IGNORE INTO categories (id, name) VALUES
  ('cat-1', 'Makanan Berat'),
  ('cat-2', 'Makanan Ringan'),
  ('cat-3', 'Minuman'),
  ('cat-4', 'Dessert');
