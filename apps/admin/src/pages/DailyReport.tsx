import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api, ApiError } from '../api/client';

interface DailyReportResponse {
  from: string;
  to: string;
  totalSales: number;
  totalExpense: number;
  net: number;
  completedOrders: number;
  salesByMethod: { method: string; total: string; count: string }[];
  daily: { day: string; total: string }[];
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Tunai', qris: 'QRIS', card: 'Kartu', transfer: 'Transfer', gofood: 'GoFood', grabfood: 'GrabFood',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

export default function DailyReport() {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [report, setReport] = useState<DailyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<DailyReportResponse>(`/reports/daily?from=${from}&to=${to}`);
      setReport(res);
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

  return (
    <Layout>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Laporan Harian</h1>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mb-6 flex items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Dari</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Sampai</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
      </div>

      {loading || !report ? (
        <p className="text-slate-500">Memuat...</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Total Penjualan</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{formatRupiah(report.totalSales)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Total Pengeluaran</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{formatRupiah(report.totalExpense)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Net</div>
              <div className={`mt-1 text-xl font-bold ${report.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatRupiah(report.net)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Order Selesai</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{report.completedOrders}</div>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Penjualan per Metode</h2>
            {report.salesByMethod.length === 0 ? (
              <p className="text-sm text-slate-400">Tidak ada penjualan di periode ini</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {report.salesByMethod.map((s) => (
                    <tr key={s.method} className="border-t border-slate-100 first:border-t-0">
                      <td className="py-2 text-slate-600">{METHOD_LABELS[s.method] ?? s.method}</td>
                      <td className="py-2 text-slate-500">{s.count}x</td>
                      <td className="py-2 text-right font-medium text-slate-900">{formatRupiah(Number(s.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Rincian Harian</h2>
            {report.daily.length === 0 ? (
              <p className="text-sm text-slate-400">Tidak ada data</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {report.daily.map((d) => (
                    <tr key={d.day} className="border-t border-slate-100 first:border-t-0">
                      <td className="py-2 text-slate-600">{new Date(d.day).toLocaleDateString('id-ID')}</td>
                      <td className="py-2 text-right font-medium text-slate-900">{formatRupiah(Number(d.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
