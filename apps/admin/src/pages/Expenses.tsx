import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import OutletSelector from '../components/OutletSelector';
import { useOutletStore } from '../store/outlet';
import { api, ApiError } from '../api/client';

interface Expense {
  id: string;
  category: string;
  amount: string;
  notes: string | null;
  recorded_at: string;
  recorded_by_name: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  bahan_baku: 'Bahan Baku',
  operasional: 'Operasional',
  gaji: 'Gaji',
  transport: 'Transport',
  lainnya: 'Lainnya',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState('operasional');
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const activeOutletId = useOutletStore((s) => s.activeOutletId);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ expenses: Expense[] }>(`/expenses?from=${from}&to=${to}`);
      setExpenses(res.expenses);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, activeOutletId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (amount <= 0) {
      setFormError('Jumlah harus lebih dari 0');
      return;
    }
    setCreating(true);
    try {
      await api.post('/expenses', { category, amount, notes: notes.trim() || undefined });
      setAmount(0);
      setNotes('');
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setFormError('Belum ada shift yang terbuka di outlet ini -- buka shift di POS dulu.');
        else setFormError(err.message);
      }
    } finally {
      setCreating(false);
    }
  }

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Pengeluaran</h1>
        <OutletSelector />
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <form onSubmit={handleCreate} className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Catat Pengeluaran</h2>
        {formError && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>}

        <div className="mb-3 flex flex-wrap gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Kategori</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-40 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500">
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Jumlah</label>
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-40 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-slate-500">Catatan</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
          </div>
        </div>

        <button type="submit" disabled={creating} className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
          {creating ? 'Menyimpan...' : 'Catat'}
        </button>
      </form>

      <div className="mb-4 flex items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Dari</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Sampai</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs text-slate-500">Total periode ini</div>
          <div className="text-lg font-bold text-slate-900">{formatRupiah(total)}</div>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Memuat...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Jumlah</th>
                <th className="px-4 py-3">Catatan</th>
                <th className="px-4 py-3">Dicatat oleh</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-600">{new Date(e.recorded_at).toLocaleString('id-ID')}</td>
                  <td className="px-4 py-3">{CATEGORY_LABELS[e.category] ?? e.category}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatRupiah(Number(e.amount))}</td>
                  <td className="px-4 py-3 text-slate-600">{e.notes ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{e.recorded_by_name ?? '-'}</td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">Tidak ada pengeluaran di periode ini</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
