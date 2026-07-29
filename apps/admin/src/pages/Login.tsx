import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useOutletStore } from '../store/outlet';

interface LoginResponse {
  token: string;
  user: {
    sub: string;
    username: string;
    fullName: string;
    homeOutletId: string;
    outletIds: string[];
    roles: string[];
    permissions: string[];
  };
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const initFromUser = useOutletStore((s) => s.initFromUser);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>('/auth/login', { username, password });
      setSession(res.token, res.user);
      initFromUser(res.user);
      navigate('/categories');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message || 'Username atau password salah');
      else setError('Tidak bisa terhubung ke server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">F&B Admin</h1>
        <p className="mb-6 text-sm text-slate-500">Masuk ke panel admin</p>

        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <label className="mb-1 block text-sm text-slate-600">Username</label>
        <input
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-sky-500"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
        />

        <label className="mb-1 block text-sm text-slate-600">Password</label>
        <input
          type="password"
          className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-sky-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-sky-500 py-2.5 font-semibold text-white transition hover:bg-sky-600 disabled:opacity-50"
        >
          {loading ? 'Memproses...' : 'Masuk'}
        </button>
      </form>
    </div>
  );
}
