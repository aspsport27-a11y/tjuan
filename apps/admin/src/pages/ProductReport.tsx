import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import OutletSelector from '../components/OutletSelector';
import { useOutletStore } from '../store/outlet';
import { api, ApiError } from '../api/client';

interface ProductRow {
  menu_item_id: string | null;
  name: string;
  qty_sold: string;
  revenue: string;
  unit_cost?: string;
  total_cost?: string;
  margin?: string;
  no_recipe?: boolean;
}

interface ProductReportResponse {
  from: string;
  to: string;
  showsCost: boolean;
  totalRevenue: number;
  totalCost?: number;
  totalMargin?: number;
  products: ProductRow[];
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

export default function ProductReport() {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [report, setReport] = useState<ProductReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeOutletId = useOutletStore((s) => s.activeOutletId);

  async function load() {
    setLoading(true);
    try {
      setReport(await api.get<ProductReportResponse>(`/reports/products?from=${from}&to=${to}`));
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

  const maxQty = report ? Math.max(...report.products.map((p) => Number(p.qty_sold)), 1) : 1;

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Produk & Margin</h1>
        <OutletSelector />
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mb-6 flex flex-wrap items-end gap-2">
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
          <div className={`mb-6 grid gap-3 ${report.showsCost ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'}`}>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Total Penjualan</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{formatRupiah(report.totalRevenue)}</div>
            </div>
            {report.showsCost && (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-500">Estimasi HPP</div>
                  <div className="mt-1 text-xl font-bold text-slate-900">{formatRupiah(report.totalCost ?? 0)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-500">Estimasi Margin</div>
                  <div className={`mt-1 text-xl font-bold ${(report.totalMargin ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatRupiah(report.totalMargin ?? 0)}
                    {report.totalRevenue > 0 && (
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        {Math.round(((report.totalMargin ?? 0) / report.totalRevenue) * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {report.showsCost && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              HPP dihitung dari resep tiap menu dikali <strong>harga bahan saat ini</strong>, bukan harga saat transaksi terjadi.
              Untuk periode lama angkanya adalah perkiraan dengan harga hari ini. Menu tanpa resep dihitung HPP 0.
            </p>
          )}

          {report.products.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">
              Tidak ada penjualan di periode ini
            </div>
          ) : (
            <>
              {/* Mobile: cards. Desktop: table. */}
              <div className="space-y-3 md:hidden">
                {report.products.map((p, idx) => {
                  const margin = Number(p.margin ?? 0);
                  return (
                    <div key={p.menu_item_id ?? idx} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-slate-900">
                          <span className="mr-2 text-xs text-slate-400">#{idx + 1}</span>
                          {p.name}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-bold text-slate-900">{Number(p.qty_sold)}</div>
                          <div className="text-xs text-slate-400">terjual</div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-slate-500">Penjualan</div>
                          <div className="font-medium text-slate-900">{formatRupiah(Number(p.revenue))}</div>
                        </div>
                        {report.showsCost && (
                          <div>
                            <div className="text-xs text-slate-500">Margin</div>
                            <div className={`font-medium ${margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatRupiah(margin)}
                              {p.no_recipe && <span className="ml-1 text-xs text-amber-600">*</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Produk</th>
                      <th className="px-4 py-3 text-right">Terjual</th>
                      <th className="px-4 py-3">Porsi</th>
                      <th className="px-4 py-3 text-right">Penjualan</th>
                      {report.showsCost && <th className="px-4 py-3 text-right">HPP</th>}
                      {report.showsCost && <th className="px-4 py-3 text-right">Margin</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {report.products.map((p, idx) => {
                      const qty = Number(p.qty_sold);
                      const margin = Number(p.margin ?? 0);
                      const marginPct = Number(p.revenue) > 0 ? Math.round((margin / Number(p.revenue)) * 100) : 0;
                      return (
                        <tr key={p.menu_item_id ?? idx} className="border-t border-slate-100">
                          <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {p.name}
                            {p.no_recipe && <span className="ml-1 text-xs text-amber-600" title="Belum ada resep -- HPP dihitung 0">*</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">{qty}</td>
                          <td className="px-4 py-3">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-sky-500" style={{ width: `${(qty / maxQty) * 100}%` }} />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">{formatRupiah(Number(p.revenue))}</td>
                          {report.showsCost && <td className="px-4 py-3 text-right text-slate-500">{formatRupiah(Number(p.total_cost ?? 0))}</td>}
                          {report.showsCost && (
                            <td className={`px-4 py-3 text-right font-medium ${margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatRupiah(margin)}
                              <span className="ml-1 text-xs font-normal text-slate-400">{marginPct}%</span>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {report.showsCost && report.products.some((p) => p.no_recipe) && (
                <p className="mt-3 text-xs text-slate-500">
                  <span className="text-amber-600">*</span> Menu ini belum punya resep, jadi HPP-nya dihitung 0 dan marginnya terlihat lebih besar dari yang sebenarnya.
                  Isi resepnya di menu <strong>Menu</strong> agar akurat.
                </p>
              )}
            </>
          )}
        </>
      )}
    </Layout>
  );
}
