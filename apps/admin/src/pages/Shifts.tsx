import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import OutletSelector from '../components/OutletSelector';
import { useOutletStore } from '../store/outlet';
import { api, ApiError } from '../api/client';

interface Shift {
  id: string;
  shift_number: number;
  status: 'open' | 'closed';
  opening_cash: string;
  opened_at: string;
  closed_at: string | null;
  closing_cash_counted: string | null;
  expected_cash: string | null;
  cash_variance: string | null;
  // Present on the list endpoint (running totals while a shift is open),
  // absent on the detail endpoint which returns the raw shift row.
  total_sales?: string;
  cash_sales?: string;
  order_count?: string;
  total_expense?: string;
}

interface ShiftDetail {
  shift: Shift;
  salesByMethod: { method: string; total: string; count: string }[];
  expenses: { id: string; category: string; amount: string; notes: string | null; recorded_at: string }[];
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Tunai', qris: 'QRIS', card: 'Kartu', transfer: 'Transfer', gofood: 'GoFood', grabfood: 'GrabFood',
};

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

export default function Shifts() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShiftDetail | null>(null);
  const activeOutletId = useOutletStore((s) => s.activeOutletId);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ shifts: Shift[] }>('/shifts');
      setShifts(res.shifts);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [activeOutletId]);

  async function openDetail(id: string) {
    try {
      const res = await api.get<ShiftDetail>(`/shifts/${id}`);
      setDetail(res);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Shift Kasir</h1>
        <OutletSelector />
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      {loading ? (
        <p className="text-slate-500">Memuat...</p>
      ) : (
        <>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Total Penjualan</div>
            <div className="mt-1 text-lg font-bold text-slate-900">
              {formatRupiah(shifts.reduce((sum, s) => sum + Number(s.total_sales ?? 0), 0))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Tunai</div>
            <div className="mt-1 text-lg font-bold text-slate-900">
              {formatRupiah(shifts.reduce((sum, s) => sum + Number(s.cash_sales ?? 0), 0))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Total Order</div>
            <div className="mt-1 text-lg font-bold text-slate-900">
              {shifts.reduce((sum, s) => sum + Number(s.order_count ?? 0), 0)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Total Selisih Kas</div>
            <div className={`mt-1 text-lg font-bold ${shifts.reduce((sum, s) => sum + Number(s.cash_variance ?? 0), 0) === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {formatRupiah(shifts.reduce((sum, s) => sum + Number(s.cash_variance ?? 0), 0))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Shift</th>
                <th className="px-4 py-3">Dibuka</th>
                <th className="px-4 py-3">Ditutup</th>
                <th className="px-4 py-3 text-right">Order</th>
                <th className="px-4 py-3 text-right">Penjualan</th>
                <th className="px-4 py-3 text-right">Tunai</th>
                <th className="px-4 py-3 text-right">Kas Awal</th>
                <th className="px-4 py-3 text-right">Selisih</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">#{s.shift_number}</td>
                  <td className="px-4 py-3 text-slate-600">{new Date(s.opened_at).toLocaleString('id-ID')}</td>
                  <td className="px-4 py-3 text-slate-600">{s.closed_at ? new Date(s.closed_at).toLocaleString('id-ID') : '-'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{Number(s.order_count ?? 0)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatRupiah(Number(s.total_sales ?? 0))}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatRupiah(Number(s.cash_sales ?? 0))}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatRupiah(Number(s.opening_cash))}</td>
                  <td className="px-4 py-3 text-right">
                    {s.cash_variance != null ? (
                      <span className={Number(s.cash_variance) === 0 ? 'text-emerald-600' : 'text-amber-600'}>
                        {formatRupiah(Number(s.cash_variance))}
                      </span>
                    ) : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.status === 'open' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.status === 'open' ? 'Terbuka' : 'Tertutup'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openDetail(s.id)} className="text-xs text-sky-600 hover:text-sky-800">Detail</button>
                  </td>
                </tr>
              ))}
              {shifts.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-slate-400">Belum ada shift</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
            <h3 className="mb-4 text-lg font-bold text-slate-900">Shift #{detail.shift.shift_number}</h3>

            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">Kas awal</div>
                <div className="font-medium text-slate-900">{formatRupiah(Number(detail.shift.opening_cash))}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Kas dihitung</div>
                <div className="font-medium text-slate-900">{detail.shift.closing_cash_counted != null ? formatRupiah(Number(detail.shift.closing_cash_counted)) : '-'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Kas seharusnya</div>
                <div className="font-medium text-slate-900">{detail.shift.expected_cash != null ? formatRupiah(Number(detail.shift.expected_cash)) : '-'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Selisih</div>
                <div className={`font-medium ${Number(detail.shift.cash_variance) === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {detail.shift.cash_variance != null ? formatRupiah(Number(detail.shift.cash_variance)) : '-'}
                </div>
              </div>
            </div>

            <div className="mb-4">
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Penjualan per Metode</div>
              {detail.salesByMethod.length === 0 ? (
                <p className="text-sm text-slate-400">Tidak ada penjualan</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {detail.salesByMethod.map((s) => (
                      <tr key={s.method}>
                        <td className="py-1 text-slate-600">{METHOD_LABELS[s.method] ?? s.method} ({s.count}x)</td>
                        <td className="py-1 text-right font-medium text-slate-900">{formatRupiah(Number(s.total))}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200">
                      <td className="py-1 font-semibold text-slate-900">Total</td>
                      <td className="py-1 text-right font-bold text-slate-900">
                        {formatRupiah(detail.salesByMethod.reduce((sum, s) => sum + Number(s.total), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            <div className="mb-6">
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Pengeluaran</div>
              {detail.expenses.length === 0 ? (
                <p className="text-sm text-slate-400">Tidak ada pengeluaran</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {detail.expenses.map((e) => (
                      <tr key={e.id}>
                        <td className="py-1 text-slate-600">{e.category}{e.notes ? ` -- ${e.notes}` : ''}</td>
                        <td className="py-1 text-right font-medium text-slate-900">{formatRupiah(Number(e.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <button onClick={() => setDetail(null)} className="w-full rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">
              Tutup
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
