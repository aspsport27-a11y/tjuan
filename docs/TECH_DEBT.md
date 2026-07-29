# Tech debt & keputusan sengaja

Daftar kompromi yang diambil sadar selama scaffold awal, supaya jelas mana
yang "belum sempat" vs "sengaja begitu dulu". Pola ini meniru
`docs/TECH_DEBT.md` di ASP Sport System.

## API response casing tidak konsisten

Beberapa endpoint mengembalikan field snake_case (langsung dari kolom
Postgres, mis. `GET /categories` → `sort_order`) dan sebagian camelCase
(field hasil komputasi, mis. `POST /orders` → `grandTotal`). Frontend
(`apps/pos/src/api/types.ts`, `apps/admin`) mengetik persis apa adanya
daripada menyamarkannya. Rapikan saat menambah endpoint baru — idealnya satu
lapisan serialisasi di API yang selalu camelCase ke luar.

## Permission adalah snapshot di JWT, bukan real-time

Saat login, permission user di-embed ke JWT (`AuthUserPayload.permissions`).
Kalau admin mengubah `role_permissions` seorang user yang sedang login,
perubahan baru berlaku setelah re-login (token berlaku sampai
`JWT_EXPIRES_IN`, default 12 jam). Cukup untuk sistem internal; kalau nanti
butuh instan, ganti jadi cek permission dari DB per-request atau tambah
`permissions_version` yang divalidasi tiap request.

## esbuild / Vite dev-server advisory (moderate, `npm audit`)

`vite@5.4.x` menarik `esbuild@0.21.5` yang punya advisory GHSA-67mh — dev
server bisa menerima request dari situs mana pun. Ini **hanya berlaku saat
`vite dev` berjalan**, bukan hasil `vite build`. Untuk pemakaian internal di
LAN kantor risikonya rendah. Perbaikan penuh butuh Vite 6/7 (breaking change,
kompatibilitas `vite-plugin-pwa` belum diuji) — belum dilakukan, sengaja
ditunda sampai ada kebutuhan nyata (mis. dev server pernah diekspos ke
jaringan tidak tepercaya).

## react-router advisory GHSA-qwww (RSC mode CSRF)

`npm audit` menandai `react-router@7.18.2` rentan pada rentang 7.12.0–8.2.0
untuk celah di **mode RSC (React Server Components)**. Kedua frontend di
repo ini adalah SPA client-side murni via `BrowserRouter`, tidak memakai RSC
sama sekali — advisory ini tidak applicable ke cara pakai kita. Tidak
di-downgrade ke 7.11.0 (saran `npm audit fix --force`) karena itu kehilangan
bug fix lain tanpa manfaat keamanan nyata untuk kita.

## POS belum offline-first sungguhan

PWA sudah men-cache app shell (bisa dibuka tanpa koneksi), tapi order yang
dibuat saat koneksi putus **belum** disimpan lokal & disinkronkan nanti.
Primary key UUID sudah dipilih dari awal justru supaya langkah ini nanti
tidak perlu migrasi skema — order bisa dibuat dengan ID di client. Yang
belum ada: local queue (IndexedDB) + logic sync + penanganan konflik stok
(dua kasir offline menjual bahan terakhir yang sama).

## Belum ada automated test

Backend divalidasi lewat smoke test manual end-to-end (login → RBAC → menu →
resep → buka meja → order → potong stok → bayar → tutup meja → rollback saat
stok kurang) via curl, bukan test suite otomatis. Prioritaskan menambah test
untuk `orders.routes.ts` dan `inventory.service.ts` duluan — itu bagian
paling kompleks (transaksi, rollback, race condition nomor order).
