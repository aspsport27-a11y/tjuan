import { useState } from 'react';
import { formatRupiah } from '@fnb/shared';
import { api, ApiError } from '../api/client';

const CATEGORY_LABELS: Record<string, string> = {
  bahan_baku: 'Bahan Baku',
  operasional: 'Operasional',
  gaji: 'Gaji',
  transport: 'Transport',
  lainnya: 'Lainnya',
};

export default function ExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState('operasional');
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (amount <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/expenses', { category, amount, notes: notes.trim() || undefined });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-6">
        <h3 className="mb-4 text-lg font-bold text-white">Catat Pengeluaran</h3>

        {error && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

        <label className="mb-1 block text-sm text-slate-300">Kategori</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-white outline-none focus:border-sky-500"
        >
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <label className="mb-1 block text-sm text-slate-300">Jumlah</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="mb-4 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-white outline-none focus:border-sky-500"
          autoFocus
        />

        <label className="mb-1 block text-sm text-slate-300">Catatan (opsional)</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mb-6 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-white outline-none focus:border-sky-500"
        />

        {amount > 0 && <p className="mb-4 text-sm text-slate-400">Akan mengurangi kas shift ini sebesar {formatRupiah(amount)}.</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg bg-slate-700 py-3 text-white hover:bg-slate-600">
            Batal
          </button>
          <button onClick={submit} disabled={busy || amount <= 0} className="flex-1 rounded-lg bg-amber-500 py-3 font-semibold text-white hover:bg-amber-400 disabled:opacity-50">
            {busy ? 'Menyimpan...' : 'Catat'}
          </button>
        </div>
      </div>
    </div>
  );
}
