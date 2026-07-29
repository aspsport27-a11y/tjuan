import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useOutletStore } from '../store/outlet';

const navItems = [
  { to: '/categories', label: 'Kategori', permission: 'menu.view' },
  { to: '/menu-items', label: 'Menu', permission: 'menu.view' },
  { to: '/ingredients', label: 'Bahan & Stok', permission: 'inventory.view' },
  { to: '/procurement', label: 'Pembelian', permission: 'procurement.manage' },
  { to: '/shifts', label: 'Shift Kasir', permission: 'shift.manage' },
  { to: '/expenses', label: 'Pengeluaran', permission: 'expense.manage' },
  { to: '/daily-report', label: 'Laporan Harian', permission: 'report.view_business' },
  { to: '/product-report', label: 'Produk & Margin', permission: 'report.view_business' },
  { to: '/users', label: 'Pengguna', permission: 'user.manage' },
  { to: '/outlets', label: 'Outlet', permission: 'outlet.manage' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, clearSession, hasPermission } = useAuthStore();
  const { clear: clearOutletStore } = useOutletStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever navigation happens, otherwise it stays
  // covering the page the user just navigated to.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-slate-800'}`;

  const sidebar = (
    <>
      <div className="px-5 py-6">
        <div className="text-lg font-bold">F&B Admin</div>
        <div className="mt-1 text-xs text-slate-400">{user?.fullName}</div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {navItems
          .filter((item) => hasPermission(item.permission))
          .map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
      </nav>

      <div className="space-y-1 p-3">
        <NavLink to="/change-password" className={linkClass}>
          Ganti Password
        </NavLink>
        <button
          onClick={() => {
            clearSession();
            clearOutletStore();
            navigate('/login');
          }}
          className="w-full rounded-lg bg-slate-800 px-3 py-2.5 text-left text-sm text-slate-300 hover:bg-slate-700"
        >
          Keluar
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Desktop: permanent sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col bg-slate-900 text-white md:flex">{sidebar}</aside>

      {/* Mobile: off-canvas drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-slate-900 text-white shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar with the hamburger */}
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Buka menu"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="font-bold text-slate-900">F&B Admin</span>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
