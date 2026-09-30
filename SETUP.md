# UMKM Pro — Panduan Setup, Build & Penggunaan

Aplikasi manajemen bisnis UMKM (kasir, stok, HPP, laporan) berbasis **React Native + Expo**.
Offline-first: semua operasi kasir jalan tanpa internet, data otomatis tersinkron ke Supabase saat online.

Fitur unggulan: **HP bisa jadi server lokal** — perangkat lain (HP staf, tablet, laptop) tinggal scan QR
dan langsung membuka web app lengkap dari browser, tanpa install apa pun dan tanpa internet.

---

## 1. Prasyarat (sekali setup per komputer)

| Kebutuhan | Versi | Keterangan |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| JDK | 17 | Untuk build Android (Temurin/Microsoft OpenJDK) |
| Android Studio | terbaru | Yang dibutuhkan: Android SDK + emulator (opsional) |
| HP Android / emulator | Android 8+ | Untuk menjalankan app |

Pastikan environment variable berikut terpasang:
- `ANDROID_HOME` → folder Android SDK (biasanya `%LOCALAPPDATA%\Android\Sdk`)
- `JAVA_HOME` → folder JDK 17

---

## 2. Setup Proyek (sekali per clone)

```powershell
git clone <url-repo> umkm-ind
cd umkm-ind\mobile
npm install
```

**Konfigurasi Supabase** — salin `.env.example` menjadi `.env` lalu isi:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

Nilai-nilai ini ada di dashboard Supabase → Project Settings → API.

---

## 3. Menjalankan untuk Development

> ⚠️ **PENTING: Jangan pakai Expo Go.** App ini punya modul native (`react-native-tcp-socket`
> untuk server lokal) yang tidak ada di Expo Go — server lokal akan diam-diam gagal nyala.
> Selalu pakai development build (`expo run:android`).

```powershell
cd mobile
npx expo run:android        # build + install dev build + start Metro
```

Pertama kali butuh 5–15 menit, selanjutnya cepat. Perubahan kode TypeScript/JS langsung
ter-reload tanpa build ulang (hot reload via Metro).

### Test server lokal di emulator

Emulator punya jaringan virtual sendiri — IP `10.0.2.x` yang tampil di app **tidak bisa**
diakses dari luar emulator. Gunakan jembatan port:

```powershell
adb forward tcp:3333 tcp:3333
```

Lalu buka **`http://localhost:3333`** di browser PC. Browser PC berperan sebagai
"perangkat staf" yang scan QR. (Forward perlu diulang tiap emulator di-restart.)

### Test server lokal di HP asli

Tidak perlu trik apa pun — IP yang tampil di QR adalah IP sungguhan di jaringan WiFi/hotspot.

---

## 4. Build APK Release (untuk dipasang di HP)

**Urutan WAJIB — web snapshot dulu, baru APK:**

```powershell
# 1. Update web snapshot — WAJIB setiap kode app berubah.
#    Ini meng-export web app & membundelnya agar bisa disajikan server HP.
cd mobile
npm run build:webdist

# 2. Build APK release (standalone, tidak butuh Metro/PC)
cd android
.\gradlew assembleRelease
```

📦 Hasil: `mobile\android\app\build\outputs\apk\release\app-release.apk` (±80 MB)

> Kalau urutannya kebalik (APK dulu baru webdist), APK akan membawa **web versi lama** —
> perangkat yang scan QR dapat tampilan yang tidak update.

### Install ke HP

```powershell
# Via USB (USB debugging aktif). -r = replace versi lama, data tidak hilang
adb install -r app\build\outputs\apk\release\app-release.apk
```

Atau salin file APK ke HP (Drive/WhatsApp/OTG) → tap → izinkan "sumber tidak dikenal" → Install.

> APK ditandatangani debug keystore — cukup untuk pemakaian internal/sideload.
> Untuk rilis ke Play Store perlu keystore rilis sendiri (belum di-setup).

---

## 5. Cara Penggunaan Aplikasi

### Fitur utama (di HP pemilik)

| Menu | Fungsi |
|---|---|
| **Dashboard** | Ringkasan order hari ini, pendapatan, stok kritis, order terbaru |
| **Katalog** | Daftar menu + tambah ke keranjang → order baru/kasir |
| **Stok** | Bahan baku, indikator Aman/Rendah/Kritis/Habis, restok → PO |
| **HPP** | Kalkulator HPP, harga jual (margin), BEP & simulasi profit |
| **Laporan** | Grafik pendapatan, menu terlaris, export Excel/PDF |

Semua fitur jalan **tanpa internet**. Saat online, data otomatis tersinkron ke Supabase
(ada indikator status sync di dashboard).

### Mode lapangan: HP jadi server untuk perangkat lain

Skenario: bazar/warung tanpa WiFi, staf perlu akses kasir dari HP/tablet masing-masing.

1. Di HP utama (yang terpasang app): nyalakan **Hotspot** (Pengaturan Android → Hotspot)
2. Sambungkan HP staf / tablet / laptop ke hotspot tersebut
3. Buka app → **Dashboard → tombol "Kelola"** di baris Server Lokal
4. Perangkat staf **scan QR code** yang tampil → web app UMKM Pro lengkap terbuka di browser
5. Staf bisa buat order, lihat stok, dll — semua data tersimpan di HP utama

Yang perlu diketahui:
- **Layar HP utama dijaga tetap menyala** selama server aktif (kalau layar mati, Android
  mematikan server). Sebaiknya HP dicolok charger selama jam operasional.
- Di layar **Kelola** terlihat siapa saja yang terhubung + log aktivitasnya.
- Internet sama sekali tidak dibutuhkan. Saat HP utama kembali online, semua transaksi
  dari staf ikut tersinkron ke Supabase.
- Versi web (`expo start --web` atau hosting) tetap mengambil data dari Supabase
  langsung — butuh internet. Hanya web yang dibuka dari server HP yang pakai data HP.

### Kontrol owner (anti-kecurangan)

1. **Atur PIN owner** di HP utama: Dashboard → Pengaturan → PIN Owner. Tanpa PIN, siapa pun
   bisa membatalkan order yang sudah dibayar.
2. **Tambah petugas**: Pengaturan → Kelola Petugas (nama + PIN 4–6 angka per kasir, HP utama saja).
   Setelah PIN owner diatur, setiap perangkat wajib login (Owner / petugas). Ganti petugas:
   tap nama di pojok kanan atas.
3. PIN owner wajib untuk: batal order yang sudah **Selesai**, simpan Pengaturan, Reset Semua Data.
4. Setiap pembatalan wajib alasan; tercatat atas nama petugas yang login; stok menu dikembalikan.
   Kasir membatalkan order apa pun (dari Dashboard) → selalu wajib PIN owner.
5. Hak akses — **Owner**: penuh. **Kasir**: order, bayar, tambah item, booking, lihat stok.
   Disembunyikan untuk kasir: Laporan, HPP, pendapatan, kelola menu, update stok, Beli Stok,
   Pengaturan.
5. Cek **Laporan → Perlu Dicek**, **Penjualan per Petugas** & **Riwayat Perubahan** (ikut di Export).
6. Riwayat (`audit_log`) tidak bisa diubah/dihapus — termasuk oleh Reset Semua Data.
7. HPP disimpan per item saat order dibuat → laba bersih periode lama tidak berubah bila HPP diubah.

> Sekali saja: jalankan ulang `migrations/supabase_schema.sql` di Supabase SQL Editor agar
> tabel `audit_log` ada di cloud. Tanpa itu app tetap jalan, tapi riwayat tidak tersinkron.

Cek logika: `node scripts/check-audit.js` dan `node scripts/check-report.js` (laporan + export Excel)

---

## 6. Perintah Ringkas (cheat sheet)

```powershell
# Development
cd mobile
npx expo run:android                  # jalankan dev build di HP/emulator
npx expo start                        # start Metro saja (app sudah terpasang)
adb forward tcp:3333 tcp:3333         # test server lokal dari browser PC (emulator)

# Rilis APK — selalu urutan ini
npm run build:webdist                 # 1. web snapshot terbaru
cd android; .\gradlew assembleRelease # 2. build APK
adb install -r app\build\outputs\apk\release\app-release.apk   # 3. pasang

# Utilitas
.\gradlew --status                    # cek daemon Gradle (jangan build saat ada yang BUSY)
.\gradlew --stop                      # hentikan semua daemon Gradle
```

---

## 7. Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Server lokal tidak pernah nyala | App jalan di **Expo Go** | Pakai dev build: `npx expo run:android` |
| Build gagal: `Could not move temporary workspace` / `Unable to delete directory` | Dua Gradle jalan bersamaan, atau cache terkunci | `.\gradlew --stop`, hapus `android\.gradle\8.8\dependencies-accessors`, build ulang. Jangan jalankan 2 build sekaligus |
| `localhost:3333` tidak bisa dibuka dari PC (emulator) | Forward belum dipasang / emulator di-restart | `adb forward tcp:3333 tcp:3333` |
| Buka `10.0.2.x:3333` dari PC → timeout | IP itu hanya berlaku di dalam emulator | Dari PC selalu pakai `localhost:3333` |
| Perangkat lain dapat web versi lama / web mini | Lupa `npm run build:webdist` sebelum build APK | Jalankan `build:webdist` lalu build APK ulang |
| QR di-scan tapi tidak terbuka | Perangkat beda jaringan dengan HP | Pastikan perangkat tergabung ke hotspot/WiFi yang sama |
| Server mati saat HP ditinggal | Layar HP mati (keep-awake tidak aktif karena server dimatikan manual) | Buka layar Kelola → Nyalakan Server; biarkan app di foreground |
| Gambar menu tidak tampil di perangkat staf | Gambar tersimpan sebagai URL Supabase (butuh internet) | Normal saat offline — data tetap jalan, hanya gambar yang tidak tampil |

---

## 8. Arsitektur Singkat (untuk developer)

```
mobile/
├── app/                  # Layar (expo-router): (tabs)/, order/, po/, server.tsx
├── lib/
│   ├── db.ts             # getDB() → SQLite (Android) | RemoteSQLiteDB (web dari HP) | SupabaseDB (web online)
│   ├── httpServer.ts     # Server TCP port 3333: web app + /api/query + API mini
│   ├── webdist.generated.ts  # Hasil expo export web (regenerate: npm run build:webdist)
│   ├── sync.ts           # Sync 2 arah SQLite ↔ Supabase (push 3 dtk, full 5 mnt)
│   └── hpp-calculator.ts # Formula HPP, harga jual, BEP
├── stores/               # Zustand: menu, stok, cart, server, auth, settings
└── scripts/pack-webdist.js  # expo export web → bundle ke webdist.generated.ts
```

Alur data saat perangkat staf akses via QR:
**Browser staf → HTTP server di HP (port 3333) → /api/query → SQLite HP → (saat online) sync ke Supabase**
