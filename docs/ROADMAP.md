# Roadmap

Status modul & rencana lanjutan. Update file ini tiap ada modul baru yang
selesai — pola sama seperti roadmap ASP Sport System.

## Selesai (MVP)

- [x] RBAC configurable (permission per role, role per user, snapshot di JWT)
- [x] Menu: kategori, menu item, modifier group/modifier (skema siap, UI picker belum)
- [x] Meja & sesi dine-in: buka meja → order → bayar → tutup meja
- [x] Order: multi-round (tambah item ke order yang sama), batal per item dengan restock
- [x] Stok bahan & resep (BOM): potong stok otomatis saat terjual, rollback penuh kalau stok kurang
- [x] HPP dasar: `GET /menu-items/:id/cost` dari resep × harga bahan
- [x] Pembayaran: cash/qris/card/transfer, auto-complete order saat lunas
- [x] POS sebagai PWA (installable, cache app shell)
- [x] Admin: kelola kategori, menu, bahan, resep

## Belum dikerjakan, urutan prioritas yang disarankan

1. **UI modifier di POS** — skema (`modifier_groups`, `modifiers`,
   `menu_item_modifier_groups`) dan API sudah mendukung; order creation di
   `orders.routes.ts` sudah menerima `modifierIds`. Yang kurang cuma picker
   di `apps/pos/src/pages/Order.tsx` saat menambah item ke cart.
2. **Laporan Bisnis vs Manajemen** — pola dari ASP Sport (dua level laporan,
   Bisnis untuk operasional harian, Manajemen untuk margin/HPP/biaya).
   Permission `report.view_business` dan `report.view_management` sudah ada
   di seed, tinggal endpoint & halaman laporannya.
3. **Kitchen Display System (KDS)** — sengaja di luar MVP awal. Butuh
   status per order_item (baru/diproses/siap) dan layar khusus dapur;
   kemungkinan realtime lewat WebSocket/SSE, bukan polling.
4. **Offline order queue di POS** — lihat detail di `docs/TECH_DEBT.md`.
5. **Multi-outlet aktif** — skema sudah siap dari hari pertama
   (`outlet_id` di semua tabel transaksional, `user_outlet_access`,
   `resolveOutletId()` sudah menerima `?outlet_id=`). Yang perlu ditambah:
   UI pemilih outlet di admin/POS, dan laporan konsolidasi holding/owner
   (pola sama seperti "beban holding/owner" di ASP Sport).
6. **QRIS/payment gateway** — saat ini `payments.method` cuma mencatat
   metode secara manual (kasir input sendiri berapa yang dibayar). Integrasi
   nyata (mis. BRIAPI QRIS seperti di ASP Sport) belum ada.
7. **Automated tests** — lihat `docs/TECH_DEBT.md`.
