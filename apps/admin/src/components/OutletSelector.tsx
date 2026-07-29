import { useEffect } from 'react';
import { useOutletStore } from '../store/outlet';
import { useAuthStore } from '../store/auth';
import { api, ApiError } from '../api/client';

interface Outlet {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
}

/**
 * Outlet picker for pages whose data is scoped to one outlet. Writes to the
 * shared store, so the choice follows the user across pages; pages re-fetch
 * by depending on activeOutletId rather than reloading the whole app.
 */
export default function OutletSelector() {
  const { user } = useAuthStore();
  const { activeOutletId, outlets, setActiveOutletId, setOutlets } = useOutletStore();

  useEffect(() => {
    if (outlets.length > 0) return;
    api
      .get<{ outlets: Outlet[] }>('/outlets')
      .then((res) => setOutlets(res.outlets))
      .catch((err) => {
        if (err instanceof ApiError) console.error(err.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.sub]);

  if (!user || user.outletIds.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-slate-500">Outlet</label>
      <select
        value={activeOutletId ?? ''}
        onChange={(e) => setActiveOutletId(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
      >
        {outlets.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}{o.is_active ? '' : ' (nonaktif)'}
          </option>
        ))}
      </select>
    </div>
  );
}
