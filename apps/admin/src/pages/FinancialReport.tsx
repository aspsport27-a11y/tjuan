import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import OutletSelector from '../components/OutletSelector';
import { useOutletStore } from '../store/outlet';
import { useAuthStore } from '../store/auth';
import { api, ApiError } from '../api/client';

interface Pnl {
  outletId: string;
  outletName: string;
  revenue: number;
  revenueByMethod: { method: string; total: number }[];
  cogsRecipe: number;
  directMaterial: number;
  grossProfit: number;
  opexByCategory: { category: string; total: number }[];
  opex: number;
  netProfit: number;
  cashIn: number;
  cashOut: number;
  purchasesReceived: number;
  supplierPaidCash: number;
  supplierPaidTotal: number;
  payables: number;
}

interface Consolidated {
  from: string;
  to: string;
  outlets: Pnl[];
  total: { revenue: number; cogsRecipe: number; directMaterial: number; grossProfit: number; opex: number; netProfit: number };
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Tunai', qris: 'QRIS', card: 'Kartu', transfer: 'Transfer', gofood: 'GoFood', grabfood: 'GrabFood',
};
const CATEGORY_LABELS: Record<string, string> = {
  bahan_baku: 'Bahan Baku', gaji: 'Gaji', sewa: 'Sewa', utilitas: 'Utilitas',
  operasional: 'Operasional', transport: 'Transport', lainnya: 'Lainnya',
};

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function rp(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}
function pct(part: number, whole: number): string {
  if (!whole) return '-';
  return `${Math.round((part / whole) * 100)}%`;
}

export default function FinancialReport() {
  const [mode, setMode] = useState<'outlet' | 'consolidated'>('outlet');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayStr());
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [consolidated, setConsolidated] = useState<Consolidated | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeOutletId = useOutletStore((s) => s.activeOutletId);
  const user = useAuthStore((s) => s.user);
  const multiOutlet = (user?.outletIds.length ?? 0) > 1;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'consolidated') {
        setConsolidated(await api.get<Consolidated>(`/reports/financial/consolidated?from=${from}&to=${to}`));
      } else {
        setPnl(await api.get<Pnl>(`/reports/financial?from=${from}&to=${to}`));
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, activeOutletId, mode]);

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          Laporan Keuangan {mode === 'consolidated' ? '- Semua Outlet' : ''}
        </h1>
        <div className="flex items-center gap-2 print:hidden">
          {mode === 'outlet' && <OutletSelector />}
          <button onClick={() => window.print()} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600">
            Cetak
          </button>
        </div>
      </div>
      <p className="mb-4 hidden print:block">
        Periode: {new Date(from).toLocaleDateString('id-ID')} &ndash; {new Date(to).toLocaleDateString('id-ID')}
        {' '}&middot; Dicetak {new Date().toLocaleString('id-ID')}
      </p>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
        {multiOutlet && (
          <div className="flex gap-2">
            <button
              onClick={() => setMode('outlet')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${mode === 'outlet' ? 'bg-sky-500 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
            >
              Per Outlet
            </button>
            <button
              onClick={() => setMode('consolidated')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${mode === 'consolidated' ? 'bg-sky-500 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
            >
              Semua Outlet
            </button>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-slate-500">Dari</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Sampai</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Memuat...</p>
      ) : mode === 'consolidated' ? (
        consolidated && <ConsolidatedView data={consolidated} />
      ) : (
        pnl && <OutletView pnl={pnl} />
      )}
    </Layout>
  );
}

function OutletView({ pnl }: { pnl: Pnl }) {
  const marginPct = pct(pnl.netProfit, pnl.revenue);

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card label="Pendapatan" value={rp(pnl.revenue)} />
        <Card label="Laba Kotor" value={rp(pnl.grossProfit)} sub={pct(pnl.grossProfit, pnl.revenue)} />
        <Card label="Laba Bersih" value={rp(pnl.netProfit)} sub={marginPct} tone={pnl.netProfit >= 0 ? 'good' : 'bad'} />
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Laba Rugi</h2>

        <Line label="Pendapatan Penjualan" value={pnl.revenue} bold />
        {pnl.revenueByMethod.map((m) => (
          <Line key={m.method} label={METHOD_LABELS[m.method] ?? m.method} value={m.total} indent />
        ))}

        <div className="my-2 border-t border-slate-100" />
        <Line label="HPP (dari resep)" value={-pnl.cogsRecipe} />
        <Line label="Belanja bahan langsung" value={-pnl.directMaterial} />

        <div className="my-2 border-t border-slate-200" />
        <Line label="LABA KOTOR" value={pnl.grossProfit} bold />

        <div className="my-2 border-t border-slate-100" />
        <Line label="Beban Operasional" value={-pnl.opex} bold />
        {pnl.opexByCategory.map((c) => (
          <Line key={c.category} label={CATEGORY_LABELS[c.category] ?? c.category} value={-c.total} indent />
        ))}
        {pnl.opexByCategory.length === 0 && <p className="py-1 pl-4 text-sm text-slate-400">Belum ada beban tercatat</p>}

        <div className="my-2 border-t-2 border-slate-300" />
        <div className="flex items-center justify-between py-2">
          <span className="font-bold text-slate-900">LABA BERSIH</span>
          <span className={`text-lg font-bold ${pnl.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {rp(pnl.netProfit)} <span className="text-sm font-normal text-slate-400">{marginPct}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Arus Kas Tunai</h2>
          <Line label="Penerimaan tunai" value={pnl.cashIn} />
          <Line label="Pengeluaran kas kasir" value={-pnl.cashOut} />
          <Line label="Bayar supplier (tunai)" value={-pnl.supplierPaidCash} />
          <div className="my-2 border-t border-slate-200" />
          <Line label="Kas bersih" value={pnl.cashIn - pnl.cashOut - pnl.supplierPaidCash} bold />
          <p className="mt-3 text-xs text-slate-400">
            Non-tunai (QRIS/GoFood/GrabFood) tidak masuk sini karena tidak melewati laci kasir.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Pembelian & Utang Supplier</h2>
          <Line label="PO diterima periode ini" value={pnl.purchasesReceived} />
          <Line label="Dibayar ke supplier periode ini" value={pnl.supplierPaidTotal} />
          <div className="my-2 border-t border-slate-200" />
          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-semibold text-slate-900">Utang supplier saat ini</span>
            <span className={`text-sm font-semibold tabular-nums ${pnl.payables > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {rp(pnl.payables)}
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Pembelian stok <strong>bukan beban</strong> di laba rugi -- ia jadi persediaan, dan baru jadi biaya (HPP) saat barangnya terjual.
            Utang adalah saldo <strong>saat ini</strong>, bukan angka periode.
          </p>
        </div>
      </div>

      {pnl.directMaterial > 0 && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <strong>Cek dobel hitung:</strong> ada {rp(pnl.directMaterial)} belanja bahan lewat Pengeluaran di periode ini.
          Pastikan itu bukan bahan yang juga dibeli lewat PO -- kalau bahan yang sama masuk dua jalur, biayanya terhitung dua kali.
        </p>
      )}
    </>
  );
}

function ConsolidatedView({ data }: { data: Consolidated }) {
  const rows: { key: keyof Consolidated['total']; label: string; negative?: boolean; bold?: boolean }[] = [
    { key: 'revenue', label: 'Pendapatan', bold: true },
    { key: 'cogsRecipe', label: 'HPP (resep)', negative: true },
    { key: 'directMaterial', label: 'Belanja bahan langsung', negative: true },
    { key: 'grossProfit', label: 'Laba Kotor', bold: true },
    { key: 'opex', label: 'Beban Operasional', negative: true },
    { key: 'netProfit', label: 'Laba Bersih', bold: true },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-4 py-3"></th>
            {data.outlets.map((o) => (
              <th key={o.outletId} className="px-4 py-3 text-right">{o.outletName}</th>
            ))}
            <th className="px-4 py-3 text-right font-bold text-slate-700">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={`border-t border-slate-100 ${r.bold ? 'bg-slate-50/50' : ''}`}>
              <td className={`px-4 py-3 ${r.bold ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{r.label}</td>
              {data.outlets.map((o) => {
                const v = o[r.key as keyof Pnl] as number;
                return (
                  <td key={o.outletId} className={`px-4 py-3 text-right ${r.bold ? 'font-semibold' : ''} ${r.key === 'netProfit' ? (v >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-slate-700'}`}>
                    {r.negative && v > 0 ? `(${rp(v)})` : rp(v)}
                  </td>
                );
              })}
              <td className={`px-4 py-3 text-right font-bold ${r.key === 'netProfit' ? (data.total[r.key] >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-slate-900'}`}>
                {r.negative && data.total[r.key] > 0 ? `(${rp(data.total[r.key])})` : rp(data.total[r.key])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : 'text-slate-900'}`}>
        {value}
        {sub && <span className="ml-2 text-sm font-normal text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}

function Line({ label, value, bold, indent }: { label: string; value: number; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 ${indent ? 'pl-4' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold text-slate-900' : indent ? 'text-slate-500' : 'text-slate-600'}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
        {value < 0 ? `(${rp(Math.abs(value))})` : rp(value)}
      </span>
    </div>
  );
}
