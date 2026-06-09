# UMKM Pro — Project Context untuk Claude Code

## Ringkasan Proyek
Aplikasi manajemen bisnis UMKM (usaha kecil menengah) berbasis mobile-first.
Stack: **Go (backend API)** + **React Native + Expo (mobile Android/iOS/Web)**.
Target pengguna: pemilik warung/restoran kecil yang butuh sistem kasir, stok, dan laporan sederhana.

---

## Tech Stack

### Backend
- **Language**: Go 1.22+
- **Framework**: Gin (`github.com/gin-gonic/gin`)
- **Database**: PostgreSQL via Supabase (cloud) + SQLite (lokal di device)
- **ORM**: sqlc (type-safe query) atau GORM
- **Auth**: Supabase Auth (JWT)
- **Export**: Apache POI via Go library untuk Excel, `jung-kurt/gofpdf` untuk PDF

### Mobile (Frontend)
- **Framework**: React Native + Expo SDK 51+
- **Router**: Expo Router (file-based routing)
- **State**: Zustand
- **DB Lokal**: expo-sqlite (offline-first)
- **Sync**: Supabase JS client
- **UI**: custom components (tidak pakai UI library besar), Tailwind via NativeWind
- **Icons**: @expo/vector-icons (Ionicons)
- **Print**: expo-print + bluetooth thermal printer

---

## Struktur Folder

```
umkm-pro/
├── backend/
│   ├── cmd/main.go
│   ├── internal/
│   │   ├── handler/          # HTTP route handlers
│   │   ├── service/          # business logic
│   │   │   ├── hpp.go        # kalkulasi HPP, harga modal, harga jual
│   │   │   ├── order.go
│   │   │   ├── stok.go
│   │   │   └── laporan.go
│   │   ├── repository/       # database queries
│   │   └── model/            # struct/entity
│   ├── migrations/           # SQL migration files
│   └── go.mod
│
└── mobile/
    ├── app/
    │   ├── (tabs)/
    │   │   ├── index.tsx         # Dashboard
    │   │   ├── katalog.tsx       # Katalog menu + cart
    │   │   ├── stok.tsx          # Manajemen stok
    │   │   ├── hpp.tsx           # Kalkulator HPP ← MODUL BARU
    │   │   └── laporan.tsx       # Laporan & analitik
    │   ├── order/
    │   │   ├── cart.tsx          # Order baru / kasir
    │   │   └── booking.tsx       # Booking order
    │   ├── po/
    │   │   └── index.tsx         # Purchase order
    │   └── _layout.tsx
    ├── components/
    │   ├── ui/                   # reusable komponen
    │   ├── forms/
    │   └── charts/
    ├── lib/
    │   ├── db.ts                 # SQLite local schema + queries
    │   ├── sync.ts               # sync logic ke Supabase
    │   ├── supabase.ts           # Supabase client config
    │   └── hpp-calculator.ts     # HPP/harga jual calculation logic
    ├── stores/
    │   ├── cartStore.ts
    │   ├── menuStore.ts
    │   ├── stokStore.ts
    │   └── authStore.ts
    └── constants/
        └── theme.ts              # design tokens (warna, spacing)
```

---

## Fitur & Modul

### 1. Dashboard
- Ringkasan: total order hari ini, pendapatan, stok kritis, customer aktif
- Order terbaru (real-time)
- Menu terlaris
- Status stok bahan baku (progress bar)

### 2. Katalog Menu
- Grid produk dengan filter kategori
- Tambah ke cart langsung dari katalog
- Badge stok rendah/habis
- Kategori: Makanan Berat, Makanan Ringan, Minuman, Dessert

### 3. Order Baru (Cart/Kasir)
- Pilih meja & customer
- Kelola item + qty
- Catatan pesanan
- Pilih metode bayar: Tunai, QRIS, Transfer, Debit/Kredit
- Hitung total + pajak + diskon
- Cetak struk (thermal printer bluetooth)

### 4. Manajemen Menu
- CRUD menu (nama, kategori, harga jual, HPP, margin)
- Toggle aktif/nonaktif
- Duplikat menu
- Tampilkan margin otomatis dari HPP

### 5. Manajemen Stok
- CRUD bahan baku
- Indikator: Aman / Rendah / Kritis / Habis
- Alert otomatis saat stok di bawah minimum
- Tombol restok → buat PO otomatis
- Export laporan stok

### 6. Kalkulator HPP ← MODUL BARU
Tiga sub-modul:

**a) Hitung HPP**
- Input bahan baku (nama, qty, satuan, harga/satuan)
- Biaya produksi tambahan (gas/listrik, kemasan, lain-lain)
- Output: HPP per porsi + breakdown komponen

**b) Harga Jual**
- Input: HPP + biaya overhead bulanan + estimasi penjualan
- Slider margin target (5–80%)
- Auto-hitung: harga modal, harga jual, profit per porsi, margin aktual
- Visual bar komposisi harga (HPP / overhead / margin)
- Rekomendasi: harga minimal, harga ideal, harga premium
- Pembulatan harga ke 500/1000/5000

**c) BEP & Simulasi**
- Input: harga jual, HPP, biaya tetap (sewa, gaji, listrik)
- Output: BEP unit/bulan, BEP rupiah, proyeksi profit
- Tabel skenario: Pesimis / Realistis / Optimis / Maksimal
- Grafik bar visual break-even

**Formula utama:**
```
HPP = Σ(qty_bahan × harga_bahan) + biaya_produksi
Harga Modal = HPP + (overhead_bulanan / estimasi_qty)
Harga Jual = Harga Modal / (1 - margin_target)
Profit = Harga Jual - Harga Modal
BEP Unit = Biaya Tetap / (Harga Jual - HPP)
```

### 7. Booking Order
- List booking mendatang
- Form booking: nama, tanggal, jam, jumlah tamu, meja/ruangan, keperluan
- Status: Menunggu / Terkonfirmasi / Diproses / Selesai
- Notifikasi H-1 booking

### 8. Purchase Order (PO)
- Buat PO ke supplier
- List item + qty + harga
- Status: Menunggu / Dalam Pengiriman / Selesai
- Konfirmasi penerimaan barang → auto update stok
- Cetak PO (PDF)

### 9. Laporan
- Filter: Hari / Minggu / Bulan / Tahun
- Grafik pendapatan harian
- Top menu terjual (qty + revenue)
- Laporan per order (dengan filter tanggal, customer, status)
- Laporan per customer (riwayat belanja)
- Export Excel / PDF

### 10. Data Customer
- CRUD customer
- Member tier: Bronze / Silver / Gold
- Riwayat order per customer
- Total belanja & rata-rata order

---

## Database Schema (ringkasan)

```sql
-- Menu & Kategori
menus (id, name, category_id, sell_price, hpp, is_active, stock, created_at)
categories (id, name)

-- HPP Komponen (untuk kalkulator HPP)
hpp_ingredients (id, menu_id, ingredient_name, qty, unit, price_per_unit)
hpp_production_costs (id, menu_id, gas_cost, packaging_cost, other_cost)

-- Stok Bahan Baku
ingredients (id, name, category, current_stock, unit, min_stock)
stock_movements (id, ingredient_id, type, qty, note, created_at)

-- Order & Transaksi
orders (id, customer_id, table_no, status, payment_method, subtotal, tax, discount, total, note, created_at)
order_items (id, order_id, menu_id, qty, price, subtotal)

-- Booking
bookings (id, customer_id, booking_date, time, guests, table_type, purpose, status)

-- Purchase Order
purchase_orders (id, supplier_name, status, total, created_at)
po_items (id, po_id, ingredient_id, qty, unit, price)

-- Customer
customers (id, name, phone, member_tier, total_orders, total_spent)
```

---

## Database Strategy

### Offline-First dengan SQLite
- Semua operasi kasir harian pakai SQLite lokal (bisa tanpa internet)
- Struktur tabel sama persis antara SQLite dan Supabase
- Sync terjadi saat koneksi tersedia

### Sync ke Supabase
```typescript
// lib/sync.ts — pola sync
async function syncPendingOrders() {
  const pending = await db.getAllAsync('SELECT * FROM orders WHERE synced = 0');
  for (const order of pending) {
    await supabase.from('orders').upsert(order);
    await db.runAsync('UPDATE orders SET synced = 1 WHERE id = ?', order.id);
  }
}
```

---

## Desain & UI Guidelines

- Warna utama: `#1D9E75` (teal/hijau) — merepresentasikan pertumbuhan bisnis
- Background: putih bersih, tidak ada gradient
- Border: tipis 0.5–1px, abu abu muda
- Font: system font (San Francisco di iOS, Roboto di Android)
- Radius: 8px (komponen kecil), 12px (card)
- Spacing: 8px grid system
- Tone: ramah, sederhana, tidak terlalu teknikal — untuk pengguna UMKM non-tech

**Status warna:**
- Hijau (`#1D9E75`) = selesai / aman / untung
- Amber (`#BA7517`) = perhatian / stok rendah / menunggu
- Merah (`#E24B4A`) = bahaya / rugi / habis
- Biru (`#185FA5`) = informasi / dalam proses

---

## Konvensi Kode

### Go (Backend)
- Handler hanya terima/kirim HTTP, logic di service
- Error selalu di-wrap dengan konteks: `fmt.Errorf("service.GetMenuByID: %w", err)`
- Response format konsisten:
```go
type APIResponse struct {
    Success bool        `json:"success"`
    Data    interface{} `json:"data,omitempty"`
    Error   string      `json:"error,omitempty"`
}
```

### React Native (Mobile)
- Semua screen pakai functional component + hooks
- State global pakai Zustand, local state pakai useState
- Async data fetching pakai React Query (`@tanstack/react-query`)
- Naming: PascalCase untuk komponen, camelCase untuk fungsi dan variabel
- Selalu handle loading state dan error state di setiap screen

---

## Perintah Dev

```bash
# Backend
cd backend && go run cmd/main.go
go test ./...

# Mobile
cd mobile && npx expo start
npx expo run:android
npx expo run:ios
npx expo build          # build production
```

---

## Catatan Penting untuk Claude

1. **Modul HPP adalah fitur utama pembeda** — selalu pastikan formula HPP, harga modal, dan BEP akurat
2. **Offline-first adalah prioritas** — semua fitur kasir harus bisa jalan tanpa internet
3. **Pengguna adalah pemilik UMKM non-tech** — UI harus sangat simpel, teks dalam Bahasa Indonesia
4. **Performa mobile** — hindari render ulang yang tidak perlu, list panjang pakai FlatList bukan ScrollView
5. **Keamanan** — jangan pernah simpan harga/transaksi tanpa validasi di backend
6. **Export data** — semua laporan harus bisa di-export (Excel untuk laporan, PDF untuk struk & PO)

