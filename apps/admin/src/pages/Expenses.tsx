import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import OutletSelector from '../components/OutletSelector';
import { useOutletStore } from '../store/outlet';
import { GridPagination, GridToolbar, SortHeader, useGrid } from '../components/grid';
import { api, ApiError } from '../api/client';

interface Expense {
  id: string;
  category: string;
  amount: string;
  notes: string | null;
  source: 'cash_drawer' | 'outlet';
  expense_date: string;
  recorded_at: string;
  recorded_by_name: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  bahan_baku: 'Bahan Baku',
  gaji: 'Gaji',
  sewa: 'Sewa',
  utilitas: 'Utilitas (listrik/air)',
  operasional: 'Operasional',
  transport: 'Transport',
  lainnya: 'Lainnya',
};

// Till expenses are what a cashier pays out of the drawer mid-shift; outlet
// charges are fixed costs paid elsewhere. Offering every category on both
// tabs would just invite miscategorised entries.
const TILL_CATEGORIES = ['bahan_baku', 'operasional', 'transport', 'lainnya'];
const OUTLET_CATEGORIES = ['gaji', 'sewa', 'utilitas', 'operasional', 'transport', 'lainnya'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

export default function Expenses() {
  const [tab, setTab] = useState<'cash_drawer' | 'outlet'>('cash_drawer');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeOutletId = useOutletStore((s) => s.activeOutletId);

  const [category, setCategory] = useState('operasional');
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayStr());
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const grid = useGrid(expenses, {
    searchFields: [(e) => CATEGORY_LABELS[e.category] ?? e.category, (e) => e.notes, (e) => e.recorded_by_name],
    sortValue: (e, key) => (key === 'amount' ? Number(e.amount) : key === 'category' ? e.category : e.expense_date),
    initialSort: { key: 'date', dir: 'desc' },
  });

  const categories = tab === 'cash_drawer' ? TILL_CATEGORIES : OUTLET_CATEGORIES;

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ expenses: Expense[] }>(`/expenses?from=${from}&to=${to}&source=${tab}`);
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
  }, [from, to, activeOutletId, tab]);

  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (amount <= 0) {
      setFormError('Jumlah harus lebih dari 0');
      return;
    }
    setCreating(true);
    try {
      await api.post('/expenses', {
        category,
        amount,
        notes: notes.trim() || undefined,
        source: tab,
        expenseDate: tab === 'outlet' ? expenseDate : undefined,
      });
      setAmount(0);
      setNotes('');
      setShowForm(false);
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

  async function remove(id: string) {
    if (!window.confirm('Hapus pengeluaran ini?')) return;
    setError(null);
    try {
      await api.delete(`/expenses/${id}`);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Pengeluaran</h1>
        <OutletSelector />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setTab('cash_drawer')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === 'cash_drawer' ? 'bg-sky-500 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
        >
          Kas Kasir
        </button>
        <button
          onClick={() => setTab('outlet')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === 'outlet' ? 'bg-sky-500 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
        >
          Beban Outlet
        </button>
      </div>

      <p className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">
        {tab === 'cash_drawer'
          ? 'Uang yang keluar dari laci kasir saat shift berjalan. Wajib ada shift terbuka, dan ikut mengurangi kas yang dihitung saat tutup shift.'
          : 'Beban outlet yang dibayar di luar laci kasir (gaji, sewa, listrik). Bisa dicatat kapan saja, tidak memengaruhi hitungan kas kasir.'}
      </p>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <button
        onClick={() => { setFormError(null); setShowForm(true); }}
        className="mb-4 rounded-lg bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-600"
      >
        + {tab === 'cash_drawer' ? 'Catat Pengeluaran Kas' : 'Catat Beban Outlet'}
      </button>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleCreate} className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-lg font-bold text-slate-900">
              {tab === 'cash_drawer' ? 'Catat Pengeluaran Kas' : 'Catat Beban Outlet'}
            </h2>
            {formError && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>}

            <label className="mb-1 block text-xs text-slate-500">Kategori</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500">
              {categories.map((k) => (
                <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
              ))}
            </select>

            <label className="mb-1 block text-xs text-slate-500">Jumlah</label>
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" autoFocus />

            {tab === 'outlet' && (
              <>
                <label className="mb-1 block text-xs text-slate-500">Tanggal beban</label>
                <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
              </>
            )}

            <label className="mb-1 block text-xs text-slate-500">Catatan</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">
                Batal
              </button>
              <button type="submit" disabled={creating} className="flex-1 rounded-lg bg-sky-500 py-2.5 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
                {creating ? 'Menyimpan...' : 'Catat'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-2">
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
        <>
        <GridToolbar grid={grid} placeholder="Cari kategori / catatan..." />
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <SortHeader grid={grid} sortKey="date">Tanggal</SortHeader>
                <SortHeader grid={grid} sortKey="category">Kategori</SortHeader>
                <SortHeader grid={grid} sortKey="amount">Jumlah</SortHeader>
                <th className="px-4 py-3">Catatan</th>
                <th className="px-4 py-3">Dicatat oleh</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-600">{new Date(e.expense_date).toLocaleDateString('id-ID')}</td>
                  <td className="px-4 py-3">{CATEGORY_LABELS[e.category] ?? e.category}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatRupiah(Number(e.amount))}</td>
                  <td className="px-4 py-3 text-slate-600">{e.notes ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{e.recorded_by_name ?? '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(e.id)} className="text-xs text-red-500 hover:text-red-700">Hapus</button>
                  </td>
                </tr>
              ))}
              {grid.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">Tidak ada data di periode ini</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <GridPagination grid={grid} />
        </>
      )}
    </Layout>
  );
}
