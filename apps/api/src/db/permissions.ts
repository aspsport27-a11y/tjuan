// Central catalogue of permission codes, grouped by module. This is the
// source of truth seeded into the `permissions` table; role -> permission
// mapping is then configurable from the admin UI (same pattern as ASP
// Sport's RBAC), not hardcoded per role.
export const PERMISSIONS = [
  // Menu
  { code: 'menu.view', module: 'menu', description: 'Lihat menu & kategori' },
  { code: 'menu.manage', module: 'menu', description: 'Kelola menu, kategori, modifier' },

  // Inventory
  { code: 'inventory.view', module: 'inventory', description: 'Lihat stok bahan' },
  { code: 'inventory.manage', module: 'inventory', description: 'Kelola bahan, resep, penyesuaian stok' },

  // Tables
  { code: 'table.manage', module: 'table', description: 'Kelola meja & sesi meja' },

  // Orders
  { code: 'order.create', module: 'order', description: 'Buat order baru' },
  { code: 'order.update', module: 'order', description: 'Ubah isi order (tambah/hapus item)' },
  { code: 'order.cancel', module: 'order', description: 'Batalkan order' },
  { code: 'order.close', module: 'order', description: 'Tutup/selesaikan order' },

  // Payments
  { code: 'payment.create', module: 'payment', description: 'Terima pembayaran' },

  // Reports
  { code: 'report.view_business', module: 'report', description: 'Lihat laporan bisnis (omzet, produk terlaris)' },
  { code: 'report.view_management', module: 'report', description: 'Lihat laporan manajemen (HPP, margin, biaya)' },

  // Admin
  { code: 'user.manage', module: 'admin', description: 'Kelola pengguna' },
  { code: 'role.manage', module: 'admin', description: 'Kelola role & hak akses' },
  { code: 'outlet.manage', module: 'admin', description: 'Kelola data outlet' },
] as const;

// Default role -> permission codes. Seeded once; editable afterwards via
// the role_permissions table / admin UI.
export const DEFAULT_ROLES: Record<string, { name: string; description: string; permissions: string[] }> = {
  owner: {
    name: 'Owner',
    description: 'Akses penuh ke seluruh sistem',
    permissions: PERMISSIONS.map((p) => p.code),
  },
  manager: {
    name: 'Manager',
    description: 'Mengelola operasional outlet sehari-hari',
    permissions: [
      'menu.view', 'menu.manage',
      'inventory.view', 'inventory.manage',
      'table.manage',
      'order.create', 'order.update', 'order.cancel', 'order.close',
      'payment.create',
      'report.view_business', 'report.view_management',
    ],
  },
  cashier: {
    name: 'Kasir',
    description: 'Melayani order & pembayaran di kasir',
    permissions: [
      'menu.view',
      'table.manage',
      'order.create', 'order.update', 'order.close',
      'payment.create',
    ],
  },
  inventory_staff: {
    name: 'Staf Gudang',
    description: 'Mengelola stok bahan baku',
    permissions: ['menu.view', 'inventory.view', 'inventory.manage'],
  },
};
