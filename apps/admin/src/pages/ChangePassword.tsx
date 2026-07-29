import { useState } from 'react';
import Layout from '../components/Layout';
import { api, ApiError } from '../api/client';

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError('Password baru minimal 8 karakter');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password baru tidak cocok');
      return;
    }

    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Gagal mengubah password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Ganti Password</h1>

      <form onSubmit={handleSubmit} className="max-w-sm rounded-xl border border-slate-200 bg-white p-6">
        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        {success && <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Password berhasil diubah.</div>}

        <label className="mb-1 block text-sm text-slate-600">Password saat ini</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-sky-500"
          autoComplete="current-password"
        />

        <label className="mb-1 block text-sm text-slate-600">Password baru</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-sky-500"
          autoComplete="new-password"
        />

        <label className="mb-1 block text-sm text-slate-600">Konfirmasi password baru</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-sky-500"
          autoComplete="new-password"
        />

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-sky-500 py-2.5 font-semibold text-white transition hover:bg-sky-600 disabled:opacity-50"
        >
          {busy ? 'Menyimpan...' : 'Simpan Password Baru'}
        </button>
      </form>
    </Layout>
  );
}
