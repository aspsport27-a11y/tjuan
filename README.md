# F&B POS System

Aplikasi kasir (POS) + backend internal untuk operasional F&B — menu & kategori,
meja & order dine-in, serta stok bahan & resep (BOM/HPP). Dibangun dengan pola
yang serupa dengan [ASP Sport System](https://github.com/aspsport27-a11y/newversion)
(RBAC configurable, laporan berlapis, `outlet_id` di semua tabel transaksional
supaya multi-outlet tinggal diaktifkan), tapi dengan stack baru: Node/TypeScript
alih-alih Python/Flask.

## Stack

| Layer | Teknologi |
|---|---|
| Database | PostgreSQL 16 |
| Backend API | Node.js + TypeScript + Fastify |
| POS (kasir) | React + Vite, PWA (installable, cache app shell) |
| Admin (back office) | React + Vite |
| Auth | JWT + RBAC configurable (permission per role, bukan hardcode) |

## Struktur repo

```
apps/
  api/            Backend Fastify — REST API, migrations runner, seed
  pos/             Aplikasi kasir (tablet), PWA
  admin/           Panel admin — menu, kategori, bahan/stok
packages/
  shared/          Types & util yang dipakai bersama (mis. formatRupiah)
database/
  migrations/      SQL migration bernomor urut, dijalankan oleh apps/api
docs/
  TECH_DEBT.md     Keputusan & kompromi yang sengaja ditunda
  ROADMAP.md       Fitur yang belum dibangun (KDS, offline order queue, dst)
```

## Setup lokal

Prasyarat: Node.js 20+, PostgreSQL 16+ berjalan lokal.

### 1. Install dependencies (root, sekali saja — npm workspaces)

```bash
npm install
```

### 2. Buat database & user PostgreSQL

```bash
sudo -u postgres psql -c "CREATE ROLE fnb_user LOGIN PASSWORD 'fnb_pass';"
sudo -u postgres psql -c "CREATE DATABASE fnb_pos OWNER fnb_user;"
```

### 3. Konfigurasi environment

```bash
cp apps/api/.env.example apps/api/.env
cp apps/pos/.env.example apps/pos/.env
cp apps/admin/.env.example apps/admin/.env
```

Edit `apps/api/.env`: set `DATABASE_URL` sesuai kredensial di atas, dan **ganti
`JWT_SECRET`** dengan string acak panjang (mis. `openssl rand -hex 32`).
`SEED_ADMIN_PASSWORD` juga wajib diganti sebelum dipakai di luar dev lokal.

### 4. Migrasi & seed database

```bash
npm run migrate
npm run seed
```

Seed membuat: 1 outlet default, 15 permission, 4 role (owner/manager/cashier/
inventory_staff), 1 user admin (role owner), dan 8 meja kosong.

### 5. Jalankan semua service (3 terminal terpisah)

```bash
npm run dev:api      # http://localhost:4000
npm run dev:pos       # http://localhost:5173
npm run dev:admin     # http://localhost:5174
```

Login dengan `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` dari `.env` (default:
`admin` / ganti sesuai yang kamu set).

## Alur kerja inti (sudah teruji end-to-end)

1. **Admin**: buat kategori → buat menu item (harga, opsi potong stok) → buat
   bahan baku → hubungkan resep (menu item butuh bahan apa & berapa banyak).
2. **POS**: pilih meja kosong → buka sesi → pilih menu → kirim order (stok
   bahan otomatis terpotong sesuai resep, transaksi dibatalkan penuh kalau
   stok kurang) → terima pembayaran → order otomatis selesai saat lunas →
   tutup meja.
3. Pembatalan item order otomatis mengembalikan (restock) bahan yang sudah
   terpotong.

## Build produksi

```bash
npm run build
```

Menghasilkan `apps/api/dist` (jalankan dengan `node dist/server.js`), serta
`apps/pos/dist` dan `apps/admin/dist` (static files, di-serve lewat Nginx atau
sejenisnya — pola sama seperti deployment ASP Sport: reverse proxy per
subdomain, mis. `pos.namadomain.id` dan `admin.namadomain.id`).

## Yang belum ada (lihat docs/ROADMAP.md)

- Kitchen Display System (KDS) — sengaja ditunda, bukan bagian MVP yang disepakati
- Offline order queue di POS (PWA saat ini cache app shell, belum menyimpan order saat koneksi putus)
- UI pemilihan modifier di POS (skema & API sudah mendukung, tinggal bangun picker-nya)
- Laporan Bisnis vs Manajemen (pola dari ASP Sport belum direplikasi di sini)
- Multi-outlet aktif (skema sudah siap — `outlet_id` di semua tabel — tinggal buka akses multi-outlet per user)
- Automated tests (saat ini divalidasi manual lewat smoke test end-to-end)
