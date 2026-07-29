import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api, ApiError } from '../api/client';

interface Category {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ categories: Category[] }>('/categories');
      setCategories(res.categories);
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
    if (!name.trim()) return;
    setError(null);
    try {
      await api.post('/categories', { name: name.trim(), sortOrder: categories.length });
      setName('');
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await api.delete(`/categories/${id}`);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  return (
    <Layout>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Kategori Menu</h1>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama kategori baru, mis. Minuman"
          className="w-72 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
        />
        <button type="submit" className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-600">
          Tambah
        </button>
      </form>

      {loading ? (
        <p className="text-slate-500">Memuat...</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Urutan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 text-slate-500">{c.sort_order}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {c.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.is_active && (
                      <button onClick={() => handleDeactivate(c.id)} className="text-xs text-red-500 hover:text-red-700">
                        Nonaktifkan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    Belum ada kategori
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
