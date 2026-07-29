import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useOutletStore } from '../store/outlet';

interface NavChild {
  to: string;
  label: string;
  permission: string;
}
interface NavGroup {
  id: string;
  label: string;
  children: NavChild[];
}

const navGroups: NavGroup[] = [
  {
    id: 'produk',
    label: 'Produk',
    children: [
      { to: '/categories', label: 'Kategori', permission: 'menu.view' },
      { to: '/menu-items', label: 'Daftar Menu', permission: 'menu.view' },
    ],
  },
  {
    id: 'inventori',
    label: 'Inventori',
    children: [
      { to: '/ingredients', label: 'Bahan & Stok', permission: 'inventory.view' },
      { to: '/procurement', label: 'Pembelian', permission: 'procurement.manage' },
    ],
  },
  {
    id: 'operasional',
    label: 'Transaksi Operasional',
    children: [
      { to: '/shifts', label: 'Shift Kasir', permission: 'shift.manage' },
      { to: '/expenses', label: 'Pengeluaran', permission: 'expense.manage' },
      { to: '/treasury', label: 'Kas & Bank', permission: 'treasury.view' },
    ],
  },
  {
    id: 'laporan',
    label: 'Laporan',
    children: [
      { to: '/daily-report', label: 'Harian', permission: 'report.view_business' },
      { to: '/product-report', label: 'Produk & Margin', permission: 'report.view_business' },
      { to: '/financial-report', label: 'Keuangan', permission: 'report.view_management' },
    ],
  },
  {
    id: 'pengaturan',
    label: 'Pengaturan',
    children: [
      { to: '/users', label: 'Pengguna', permission: 'user.manage' },
      { to: '/outlets', label: 'Outlet', permission: 'outlet.manage' },
    ],
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, clearSession, hasPermission } = useAuthStore();
  const { clear: clearOutletStore } = useOutletStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Hide a group entirely when the user can't see any of its pages, rather
  // than leaving an empty heading behind.
  const visibleGroups = navGroups
    .map((g) => ({ ...g, children: g.children.filter((c) => hasPermission(c.permission)) }))
    .filter((g) => g.children.length > 0);

  const groupOfPath = (path: string) => visibleGroups.find((g) => g.children.some((c) => c.to === path))?.id;

  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    const active = groupOfPath(location.pathname);
    return active ? [active] : visibleGroups.slice(0, 1).map((g) => g.id);
  });

  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
    // Keep the group containing the current page open, without collapsing
    // whatever else the user chose to expand.
    const active = groupOfPath(location.pathname);
    if (active) setOpenGroups((prev) => (prev.includes(active) ? prev : [...prev, active]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  function toggleGroup(id: string) {
    setOpenGroups((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  function logout() {
    clearSession();
    clearOutletStore();
    navigate('/login');
  }

  const sidebar = (
    <>
      <div className="px-5 py-6">
        <div className="text-lg font-bold">F&B Admin</div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {visibleGroups.map((group) => {
          const isOpen = openGroups.includes(group.id);
          const hasActive = group.children.some((c) => c.to === location.pathname);
          return (
            <div key={group.id}>
              <button
                onClick={() => toggleGroup(group.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition ${
                  hasActive && !isOpen ? 'text-sky-400' : 'text-slate-400'
                } hover:bg-slate-800 hover:text-slate-200`}
              >
                <span>{group.label}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {isOpen && (
                <div className="mb-1 space-y-0.5 pl-2">
                  {group.children.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `block rounded-lg px-3 py-2 text-sm font-medium ${
                          isActive ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-slate-800'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Desktop: permanent sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col bg-slate-900 text-white md:flex print:hidden">{sidebar}</aside>

      {/* Mobile: off-canvas drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden print:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-slate-900 text-white shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 print:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Buka menu"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="font-bold text-slate-900 md:hidden">F&B Admin</span>

          <div className="relative ml-auto">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500 text-xs font-bold text-white">
                {(user?.fullName ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden max-w-[10rem] truncate font-medium sm:inline">{user?.fullName}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {menuOpen && (
              <>
                {/* Click-anywhere-else to dismiss */}
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <div className="truncate text-sm font-semibold text-slate-900">{user?.fullName}</div>
                    <div className="truncate text-xs text-slate-500">
                      {user?.username}
                      {user?.roles?.length ? ` · ${user.roles.join(', ')}` : ''}
                    </div>
                  </div>
                  <NavLink
                    to="/change-password"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Ganti Password
                  </NavLink>
                  <button
                    onClick={logout}
                    className="block w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Keluar
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
