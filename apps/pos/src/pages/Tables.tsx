import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuthStore } from '../store/auth';
import type { TableDto, TableSessionDto } from '../api/types';
import ChangePasswordModal from '../components/ChangePasswordModal';

const statusStyles: Record<TableDto['status'], string> = {
  available: 'bg-emerald-500/15 border-emerald-500 text-emerald-400',
  occupied: 'bg-amber-500/15 border-amber-500 text-amber-400',
  reserved: 'bg-slate-500/15 border-slate-500 text-slate-300',
};

const statusLabel: Record<TableDto['status'], string> = {
  available: 'Kosong',
  occupied: 'Terisi',
  reserved: 'Dipesan',
};

export default function Tables() {
  const [tables, setTables] = useState<TableDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const navigate = useNavigate();
  const { user, clearSession } = useAuthStore();

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ tables: TableDto[] }>('/tables');
      setTables(res.tables);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleTableClick(table: TableDto) {
    setError(null);
    if (table.open_session_id) {
      navigate(`/order/${table.open_session_id}`);
      return;
    }
    setBusyId(table.id);
    try {
      const res = await api.post<{ session: TableSessionDto }>(`/tables/${table.id}/open-session`, {
        orderType: 'dine_in',
      });
      navigate(`/order/${res.session.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Someone else opened it a moment ago -- just refresh and follow.
          await load();
        } else {
          setError(err.message);
        }
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 pb-24">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Meja</h1>
          <p className="text-sm text-slate-400">{user?.fullName}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowChangePassword(true)}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
          >
            Ganti Password
          </button>
          <button
            onClick={() => {
              clearSession();
              navigate('/login');
            }}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
          >
            Keluar
          </button>
        </div>
      </header>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}

      {error && <div className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

      {loading ? (
        <p className="text-slate-400">Memuat meja...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {tables.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTableClick(t)}
              disabled={busyId === t.id}
              className={`rounded-2xl border-2 p-5 text-left transition active:scale-95 disabled:opacity-50 ${statusStyles[t.status]}`}
            >
              <div className="text-lg font-bold text-white">{t.name}</div>
              <div className="text-xs opacity-80">{t.capacity} kursi</div>
              <div className="mt-3 text-sm font-medium">{statusLabel[t.status]}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
