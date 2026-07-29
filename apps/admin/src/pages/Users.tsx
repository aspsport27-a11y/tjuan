import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import OutletSelector from '../components/OutletSelector';
import { useOutletStore } from '../store/outlet';
import { api, ApiError } from '../api/client';

interface UserRow {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  roles: string[];
}

interface Role {
  code: string;
  name: string;
}

export default function Users() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const activeOutletId = useOutletStore((s) => s.activeOutletId);

  async function load() {
    setLoading(true);
    try {
      const [userRes, roleRes] = await Promise.all([
        api.get<{ users: UserRow[] }>('/users'),
        api.get<{ roles: Role[] }>('/roles'),
      ]);
      setUsers(userRes.users);
      setRoles(roleRes.roles);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOutletId]);

  function toggleRole(code: string) {
    setSelectedRoles((prev) => (prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code]));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!username.trim() || !fullName.trim() || password.length < 8 || selectedRoles.length === 0) {
      setFormError('Lengkapi username, nama, password (min. 8 karakter), dan pilih minimal 1 role');
      return;
    }
    setCreating(true);
    try {
      await api.post('/users', { username: username.trim(), fullName: fullName.trim(), password, roleCodes: selectedRoles });
      setUsername('');
      setFullName('');
      setPassword('');
      setSelectedRoles([]);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(u: UserRow) {
    try {
      await api.put(`/users/${u.id}`, { isActive: !u.isActive });
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Pengguna</h1>
        <OutletSelector />
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <form onSubmit={handleCreate} className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Tambah Pengguna Baru</h2>

        {formError && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>}

        <div className="mb-3 flex flex-wrap gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-40 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Nama lengkap</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-48 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Password awal</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-40 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
          </div>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs text-slate-500">Role</label>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <label key={r.code} className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${selectedRoles.includes(r.code) ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-300 text-slate-600'}`}>
                <input type="checkbox" className="mr-1.5" checked={selectedRoles.includes(r.code)} onChange={() => toggleRole(r.code)} />
                {r.name}
              </label>
            ))}
          </div>
        </div>

        <button type="submit" disabled={creating} className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
          {creating ? 'Menyimpan...' : 'Tambah Pengguna'}
        </button>
      </form>

      {loading ? (
        <p className="text-slate-500">Memuat...</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{u.username}</td>
                  <td className="px-4 py-3 text-slate-700">{u.fullName}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <span key={r} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {u.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    <button onClick={() => setEditTarget(u)} className="text-xs text-sky-600 hover:text-sky-800">Edit</button>
                    <button onClick={() => setResetTarget(u)} className="text-xs text-sky-600 hover:text-sky-800">Reset Password</button>
                    <button onClick={() => toggleActive(u)} className="text-xs text-red-500 hover:text-red-700">
                      {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">Belum ada pengguna</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {resetTarget && (
        <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
      )}

      {editTarget && (
        <EditUserModal
          user={editTarget}
          roles={roles}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            setEditTarget(null);
            await load();
          }}
        />
      )}
    </Layout>
  );
}

function ResetPasswordModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (newPassword.length < 8) {
      setError('Password minimal 8 karakter');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password tidak cocok');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, { newPassword });
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6">
        <h3 className="mb-1 text-lg font-bold text-slate-900">Reset Password</h3>
        <p className="mb-4 text-xs text-slate-500">Untuk pengguna: <span className="font-medium">{user.username}</span> ({user.fullName})</p>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        {success && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Password berhasil direset. Sampaikan password baru ke pengguna terkait.</div>}

        {!success && (
          <>
            <label className="mb-1 block text-xs text-slate-500">Password baru</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
            <label className="mb-1 block text-xs text-slate-500">Konfirmasi password baru</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
          </>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">{success ? 'Tutup' : 'Batal'}</button>
          {!success && (
            <button onClick={submit} disabled={busy} className="flex-1 rounded-lg bg-sky-500 py-2.5 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
              {busy ? 'Menyimpan...' : 'Reset'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EditUserModal({ user, roles, onClose, onSaved }: { user: UserRow; roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(user.fullName);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(user.roles);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleRole(code: string) {
    setSelectedRoles((prev) => (prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code]));
  }

  async function save() {
    if (!fullName.trim() || selectedRoles.length === 0) {
      setError('Nama tidak boleh kosong dan pilih minimal 1 role');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.put(`/users/${user.id}`, { fullName: fullName.trim(), roleCodes: selectedRoles });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6">
        <h3 className="mb-4 text-lg font-bold text-slate-900">Edit Pengguna: {user.username}</h3>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <label className="mb-1 block text-xs text-slate-500">Nama lengkap</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

        <label className="mb-1 block text-xs text-slate-500">Role</label>
        <div className="mb-6 flex flex-wrap gap-2">
          {roles.map((r) => (
            <label key={r.code} className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${selectedRoles.includes(r.code) ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-300 text-slate-600'}`}>
              <input type="checkbox" className="mr-1.5" checked={selectedRoles.includes(r.code)} onChange={() => toggleRole(r.code)} />
              {r.name}
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">Batal</button>
          <button onClick={save} disabled={busy} className="flex-1 rounded-lg bg-sky-500 py-2.5 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
            {busy ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
