import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatRupiah } from '@fnb/shared';
import { api, ApiError } from '../api/client';

interface DailyReport {
  from: string;
  to: string;
  totalSales: number;
  totalExpense: number;
  net: number;
  completedOrders: number;
  salesByMethod: { method: string; total: string; count: string }[];
  daily: { day: string; total: string }[];
}

interface Expense {
  id: string;
  category: string;
  amount: string;
  notes: string | null;
  source: 'cash_drawer' | 'outlet';
  expense_date: string;
  recorded_by_name: string | null;
}

interface ShiftSummary {
  id: string;
  shift_number: number;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  total_sales?: string;
  order_count?: string;
  cash_variance: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Tunai', qris: 'QRIS', card: 'Kartu', transfer: 'Transfer', gofood: 'GoFood', grabfood: 'GrabFood',
};
const CATEGORY_LABELS: Record<string, string> = {
  bahan_baku: 'Bahan Baku', gaji: 'Gaji', sewa: 'Sewa', utilitas: 'Utilitas',
  operasional: 'Operasional', transport: 'Transport', lainnya: 'Lainnya',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Reports() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [report, setReport] = useState<DailyReport | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [shifts, setShifts] = useState<ShiftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [r, e, s] = await Promise.all([
        api.get<DailyReport>(`/reports/daily?from=${from}&to=${to}`),
        api.get<{ expenses: Expense[] }>(`/expenses?from=${from}&to=${to}`),
        api.get<{ shifts: ShiftSummary[] }>('/shifts'),
      ]);
      setReport(r);
      setExpenses(e.expenses);
      setShifts(s.shifts);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totalExpenseInRange = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const shiftsInRange = shifts.filter((s) => {
    const d = s.opened_at.slice(0, 10);
    return d >= from && d <= to;
  });

  return (
    <div className="min-h-screen bg-slate-900 p-4 pb-10">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Laporan</h1>
          <p className="text-sm text-slate-400">Penjualan &amp; pengeluaran</p>
        </div>
        <button onClick={() => navigate('/')} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700">
          &larr; Kembali
        </button>
      </header>

      {error && <div className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Dari</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Sampai</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
        </div>
        <div className="flex gap-1">
          <button onClick={() => { setFrom(todayStr()); setTo(todayStr()); }} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700">
            Hari ini
          </button>
        </div>
      </div>

      {loading || !report ? (
        <p className="text-slate-400">Memuat...</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-800 p-4">
              <div className="text-xs text-slate-400">Penjualan</div>
              <div className="mt-1 text-xl font-bold text-emerald-400">{formatRupiah(report.totalSales)}</div>
            </div>
            <div className="rounded-xl bg-slate-800 p-4">
              <div className="text-xs text-slate-400">Pengeluaran</div>
              <div className="mt-1 text-xl font-bold text-red-400">{formatRupiah(totalExpenseInRange)}</div>
            </div>
            <div className="rounded-xl bg-slate-800 p-4">
              <div className="text-xs text-slate-400">Net</div>
              <div className={`mt-1 text-xl font-bold ${report.totalSales - totalExpenseInRange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatRupiah(report.totalSales - totalExpenseInRange)}
              </div>
            </div>
            <div className="rounded-xl bg-slate-800 p-4">
              <div className="text-xs text-slate-400">Order Selesai</div>
              <div className="mt-1 text-xl font-bold text-white">{report.completedOrders}</div>
            </div>
          </div>

          <h2 className="mb-2 text-sm font-semibold text-slate-300">Penjualan per Metode</h2>
          <div className="mb-6 overflow-hidden rounded-xl bg-slate-800">
            {report.salesByMethod.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Tidak ada penjualan di periode ini</p>
            ) : (
              report.salesByMethod.map((m, idx) => (
                <div key={m.method} className={`flex items-center justify-between px-4 py-3 text-sm ${idx > 0 ? 'border-t border-slate-700' : ''}`}>
                  <span className="text-slate-300">{METHOD_LABELS[m.method] ?? m.method} <span className="text-slate-500">({m.count}x)</span></span>
                  <span className="font-semibold text-white">{formatRupiah(Number(m.total))}</span>
                </div>
              ))
            )}
          </div>

          <h2 className="mb-2 text-sm font-semibold text-slate-300">Shift di Periode Ini</h2>
          <div className="mb-6 overflow-hidden rounded-xl bg-slate-800">
            {shiftsInRange.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Tidak ada shift di periode ini</p>
            ) : (
              shiftsInRange.map((s, idx) => (
                <div key={s.id} className={`flex items-center justify-between px-4 py-3 text-sm ${idx > 0 ? 'border-t border-slate-700' : ''}`}>
                  <div>
                    <span className="font-medium text-white">Shift #{s.shift_number}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${s.status === 'open' ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-700 text-slate-400'}`}>
                      {s.status === 'open' ? 'Terbuka' : 'Tertutup'}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-white">{formatRupiah(Number(s.total_sales ?? 0))}</div>
                    <div className="text-xs text-slate-500">{s.order_count ?? 0} order</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <h2 className="mb-2 text-sm font-semibold text-slate-300">Rincian Pengeluaran</h2>
          <div className="overflow-hidden rounded-xl bg-slate-800">
            {expenses.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Tidak ada pengeluaran di periode ini</p>
            ) : (
              expenses.map((e, idx) => (
                <div key={e.id} className={`flex items-center justify-between px-4 py-3 text-sm ${idx > 0 ? 'border-t border-slate-700' : ''}`}>
                  <div>
                    <div className="text-slate-200">{CATEGORY_LABELS[e.category] ?? e.category}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(e.expense_date).toLocaleDateString('id-ID')}
                      {e.notes ? ` · ${e.notes}` : ''}
                      {e.source === 'outlet' ? ' · Beban Outlet' : ''}
                    </div>
                  </div>
                  <span className="font-semibold text-red-400">{formatRupiah(Number(e.amount))}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
