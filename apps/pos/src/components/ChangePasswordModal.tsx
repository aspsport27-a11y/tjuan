import { useState } from 'react';
import { api, ApiError } from '../api/client';

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
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
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Gagal mengubah password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-6">
        <h3 className="mb-4 text-lg font-bold text-white">Ganti Password</h3>

        {error && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
        {success && <div className="mb-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">Password berhasil diubah.</div>}

        {!success && (
          <>
            <label className="mb-1 block text-sm text-slate-300">Password saat ini</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-white outline-none focus:border-sky-500"
              autoComplete="current-password"
            />

            <label className="mb-1 block text-sm text-slate-300">Password baru</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-white outline-none focus:border-sky-500"
              autoComplete="new-password"
            />

            <label className="mb-1 block text-sm text-slate-300">Konfirmasi password baru</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mb-6 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-white outline-none focus:border-sky-500"
              autoComplete="new-password"
            />
          </>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg bg-slate-700 py-3 text-white hover:bg-slate-600">
            {success ? 'Tutup' : 'Batal'}
          </button>
          {!success && (
            <button onClick={submit} disabled={busy} className="flex-1 rounded-lg bg-sky-500 py-3 font-semibold text-white hover:bg-sky-400 disabled:opacity-50">
              {busy ? 'Menyimpan...' : 'Simpan'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
