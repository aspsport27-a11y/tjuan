import { create } from 'zustand';
import type { AuthUser } from './auth';

interface Outlet {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
}

interface OutletState {
  activeOutletId: string | null;
  outlets: Outlet[];
  setActiveOutletId: (id: string) => void;
  setOutlets: (outlets: Outlet[]) => void;
  /** Called right after login: pick up a persisted choice only if the user
   * still has access to it, otherwise fall back to their home outlet. This
   * prevents a stale localStorage value (different user, or an outlet the
   * current user lost access to) from silently 403-ing every request. */
  initFromUser: (user: AuthUser) => void;
  clear: () => void;
}

const STORAGE_KEY = 'fnb_admin_active_outlet';

export const useOutletStore = create<OutletState>((set) => ({
  activeOutletId: null,
  outlets: [],
  setActiveOutletId: (id) => {
    localStorage.setItem(STORAGE_KEY, id);
    set({ activeOutletId: id });
  },
  setOutlets: (outlets) => set({ outlets }),
  initFromUser: (user) => {
    const persisted = localStorage.getItem(STORAGE_KEY);
    const activeOutletId = persisted && user.outletIds.includes(persisted) ? persisted : user.homeOutletId;
    localStorage.setItem(STORAGE_KEY, activeOutletId);
    set({ activeOutletId });
  },
  clear: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ activeOutletId: null, outlets: [] });
  },
}));
