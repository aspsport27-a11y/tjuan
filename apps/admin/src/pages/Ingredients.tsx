import { useEffect, useState } from 'react';
import { formatRupiah } from '@fnb/shared';
import Layout from '../components/Layout';
import { api, ApiError } from '../api/client';

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  current_stock: string;
  min_stock: string;
  cost_per_unit: string;
}

export default function Ingredients() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [minStock, setMinStock] = useState('0');
  const [costPerUnit, setCostPerUnit] = useState('0');

  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ ingredients: Ingredient[] }>('/ingredients');
      setIngredients(res.ingredients);
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
    if (!name.trim() || !unit.trim()) return;
    setError(null);
    try {
      await api.post('/ingredients', {
        name: name.trim(),
        unit: unit.trim(),
        minStock: Number(minStock),
        costPerUnit: Number(costPerUnit),
      });
      setName('');
      setUnit('');
      setMinStock('0');
      setCostPerUnit('0');
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  return (
    <Layout>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Bahan & Stok</h1>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Nama bahan</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-48 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Satuan</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="gram / ml / pcs" className="w-28 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Stok minimum</label>
          <input type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} className="w-24 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Harga/satuan (Rp)</label>
          <input type="number" value={costPerUnit} onChange={(e) => setCostPerUnit(e.target.value)} className="w-32 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
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
                <th className="px-4 py-3">Stok saat ini</th>
                <th className="px-4 py-3">Stok minimum</th>
                <th className="px-4 py-3">Harga/satuan</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((i) => {
                const low = Number(i.current_stock) <= Number(i.min_stock);
                return (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{i.name}</td>
                    <td className={`px-4 py-3 ${low ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
                      {Number(i.current_stock)} {i.unit} {low && '⚠'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{Number(i.min_stock)} {i.unit}</td>
                    <td className="px-4 py-3 text-slate-700">{formatRupiah(Number(i.cost_per_unit))}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setAdjustTarget(i)} className="text-xs text-sky-600 hover:text-sky-800">
                        Sesuaikan Stok
                      </button>
                    </td>
                  </tr>
                );
              })}
              {ingredients.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Belum ada bahan
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {adjustTarget && (
        <AdjustModal
          ingredient={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onSaved={async () => {
            setAdjustTarget(null);
            await load();
          }}
        />
      )}
    </Layout>
  );
}

function AdjustModal({ ingredient, onClose, onSaved }: { ingredient: Ingredient; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<'purchase' | 'adjustment' | 'waste'>('purchase');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState(ingredient.cost_per_unit);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const qty = Number(quantity);
    if (!qty) return;
    setBusy(true);
    setError(null);
    try {
      // "purchase" always adds, "waste" always removes; only "adjustment"
      // (koreksi) takes the sign the user typed.
      const signedQty = type === 'waste' ? -Math.abs(qty) : type === 'purchase' ? Math.abs(qty) : qty;
      await api.post(`/ingredients/${ingredient.id}/adjust`, {
        quantity: signedQty,
        type,
        unitCost: type === 'purchase' ? Number(unitCost) : undefined,
        notes: notes || undefined,
      });
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
        <h3 className="mb-1 text-lg font-bold text-slate-900">Sesuaikan Stok</h3>
        <p className="mb-4 text-xs text-slate-500">{ingredient.name} &middot; stok saat ini {Number(ingredient.current_stock)} {ingredient.unit}</p>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <div className="mb-3 grid grid-cols-3 gap-2">
          {(['purchase', 'adjustment', 'waste'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-lg py-2 text-xs font-medium ${type === t ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {t === 'purchase' ? 'Pembelian' : t === 'waste' ? 'Terbuang' : 'Koreksi'}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-xs text-slate-500">
          {type === 'adjustment' ? 'Perubahan (boleh negatif)' : 'Jumlah'} ({ingredient.unit})
        </label>
        <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

        {type === 'purchase' && (
          <>
            <label className="mb-1 block text-xs text-slate-500">Harga per satuan (Rp)</label>
            <input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
          </>
        )}

        <label className="mb-1 block text-xs text-slate-500">Catatan</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">Batal</button>
          <button onClick={submit} disabled={busy} className="flex-1 rounded-lg bg-sky-500 py-2.5 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
            {busy ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
