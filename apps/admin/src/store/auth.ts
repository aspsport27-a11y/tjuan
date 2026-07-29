import { create } from 'zustand';

export interface AuthUser {
  sub: string;
  username: string;
  fullName: string;
  homeOutletId: string;
  outletIds: string[];
  roles: string[];
  permissions: string[];
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  clearSession: () => void;
  hasPermission: (...anyOf: string[]) => boolean;
}

const STORAGE_KEY = 'fnb_admin_session';

function loadInitial(): { token: string | null; user: AuthUser | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null };
    return JSON.parse(raw);
  } catch {
    return { token: null, user: null };
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...loadInitial(),
  setSession: (token, user) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
    set({ token, user });
  },
  clearSession: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ token: null, user: null });
  },
  hasPermission: (...anyOf: string[]) => {
    const perms = get().user?.permissions ?? [];
    return anyOf.some((p) => perms.includes(p));
  },
}));
