import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

const navItems = [
  { to: '/categories', label: 'Kategori', permission: 'menu.view' },
  { to: '/menu-items', label: 'Menu', permission: 'menu.view' },
  { to: '/ingredients', label: 'Bahan & Stok', permission: 'inventory.view' },
  { to: '/users', label: 'Pengguna', permission: 'user.manage' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, clearSession, hasPermission } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-56 flex-col bg-slate-900 text-white">
        <div className="px-5 py-6">
          <div className="text-lg font-bold">F&B Admin</div>
          <div className="mt-1 text-xs text-slate-400">{user?.fullName}</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {navItems
            .filter((item) => hasPermission(item.permission))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-slate-800'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
        </nav>
        <div className="space-y-1 p-3">
          <NavLink
            to="/change-password"
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-slate-800'}`
            }
          >
            Ganti Password
          </NavLink>
          <button
            onClick={() => {
              clearSession();
              navigate('/login');
            }}
            className="w-full rounded-lg bg-slate-800 px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700"
          >
            Keluar
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
