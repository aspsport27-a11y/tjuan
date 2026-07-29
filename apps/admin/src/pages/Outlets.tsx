import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api, ApiError } from '../api/client';

interface Outlet {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
}

export default function Outlets() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [editTarget, setEditTarget] = useState<Outlet | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ outlets: Outlet[] }>('/outlets');
      setOutlets(res.outlets);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCreated(false);
    if (!code.trim() || !name.trim()) {
      setFormError('Kode dan nama outlet wajib diisi');
      return;
    }
    setCreating(true);
    try {
      await api.post('/outlets', { code: code.trim(), name: name.trim(), address: address.trim() || undefined, phone: phone.trim() || undefined });
      setCode('');
      setName('');
      setAddress('');
      setPhone('');
      setCreated(true);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(o: Outlet) {
    try {
      await api.put(`/outlets/${o.id}`, { isActive: !o.is_active });
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function deleteOutlet(o: Outlet) {
    if (!window.confirm(`Hapus outlet "${o.name}"? Ini tidak bisa dibatalkan.`)) return;
    setError(null);
    try {
      await api.delete(`/outlets/${o.id}`);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  return (
    <Layout>
      <h1 className="mb-6 text-xl font-bold text-slate-900 sm:text-2xl">Outlet</h1>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <form onSubmit={handleCreate} className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Tambah Outlet Baru</h2>

        {formError && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>}
        {created && (
          <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Outlet dibuat. Anda (owner) perlu <strong>logout &amp; login ulang</strong> untuk bisa mengaksesnya di daftar outlet.
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Kode</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="mis. resto2" className="w-32 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Nama outlet</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-48 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Alamat</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-56 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Telepon</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-40 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
          </div>
        </div>

        <button type="submit" disabled={creating} className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
          {creating ? 'Menyimpan...' : 'Tambah Outlet'}
        </button>
      </form>

      {loading ? (
        <p className="text-slate-500">Memuat...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Alamat</th>
                <th className="px-4 py-3">Telepon</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {outlets.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{o.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{o.name}</td>
                  <td className="px-4 py-3 text-slate-600">{o.address ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{o.phone ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${o.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {o.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    <button onClick={() => setEditTarget(o)} className="text-xs text-sky-600 hover:text-sky-800">Edit</button>
                    <button onClick={() => toggleActive(o)} className="text-xs text-amber-600 hover:text-amber-700">
                      {o.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button onClick={() => deleteOutlet(o)} className="text-xs text-red-500 hover:text-red-700">Hapus</button>
                  </td>
                </tr>
              ))}
              {outlets.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">Belum ada outlet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editTarget && (
        <EditOutletModal
          outlet={editTarget}
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

function EditOutletModal({ outlet, onClose, onSaved }: { outlet: Outlet; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(outlet.name);
  const [address, setAddress] = useState(outlet.address ?? '');
  const [phone, setPhone] = useState(outlet.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError('Nama outlet tidak boleh kosong');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.put(`/outlets/${outlet.id}`, { name: name.trim(), address: address.trim() || null, phone: phone.trim() || null });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6">
        <h3 className="mb-1 text-lg font-bold text-slate-900">Edit Outlet</h3>
        <p className="mb-4 text-xs font-mono text-slate-400">{outlet.code}</p>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <label className="mb-1 block text-xs text-slate-500">Nama outlet</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

        <label className="mb-1 block text-xs text-slate-500">Alamat</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

        <label className="mb-1 block text-xs text-slate-500">Telepon</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

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
