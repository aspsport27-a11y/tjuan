import { useState } from 'react';
import { formatRupiah } from '@fnb/shared';
import { api, ApiError } from '../api/client';
import type { PaymentMethod } from '../api/types';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  card: 'Kartu',
  transfer: 'Transfer',
  gofood: 'GoFood',
  grabfood: 'GrabFood',
};

export default function PaymentModal({
  orderId,
  remainingDue,
  onClose,
  onPaid,
}: {
  orderId: string;
  remainingDue: number;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState(remainingDue);
  const [amount, setAmount] = useState(remainingDue);
  const [referenceNo, setReferenceNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCash = method === 'cash';
  // For cash: only what's actually kept toward the bill is ever sent as the
  // payment amount -- change is a UI-only concept, never posted to the API,
  // otherwise cash-drawer reconciliation ends up inflated by every bit of
  // change given all shift long.
  const amountToApply = isCash ? Math.min(tendered, remainingDue) : amount;
  const change = isCash ? Math.max(tendered - remainingDue, 0) : 0;
  const isPartialCash = isCash && tendered > 0 && tendered < remainingDue;

  function selectMethod(m: PaymentMethod) {
    setMethod(m);
    setError(null);
    if (m === 'cash') setTendered(remainingDue);
    else setAmount(remainingDue);
  }

  async function submit() {
    if (amountToApply <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/orders/${orderId}/payments`, {
        method,
        amount: amountToApply,
        referenceNo: referenceNo.trim() || undefined,
      });
      onPaid();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-6">
        <h3 className="mb-1 text-lg font-bold text-white">Pembayaran</h3>
        <p className="mb-4 text-slate-300">Sisa tagihan: {formatRupiah(remainingDue)}</p>

        {error && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

        <div className="mb-4 grid grid-cols-3 gap-2">
          {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => selectMethod(m)}
              className={`rounded-lg py-2 text-xs font-medium ${method === m ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>

        {isCash ? (
          <>
            <label className="mb-1 block text-sm text-slate-300">Uang diterima</label>
            <input
              type="number"
              value={tendered}
              onChange={(e) => setTendered(Number(e.target.value))}
              className="mb-2 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-white outline-none focus:border-sky-500"
              autoFocus
            />
            {change > 0 && <div className="mb-4 text-sm font-medium text-emerald-400">Kembalian: {formatRupiah(change)}</div>}
            {isPartialCash && (
              <div className="mb-4 text-xs text-amber-400">
                Bayar sebagian ({formatRupiah(tendered)}) -- sisa {formatRupiah(remainingDue - tendered)} tetap belum lunas.
              </div>
            )}
          </>
        ) : (
          <>
            <label className="mb-1 block text-sm text-slate-300">Jumlah</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mb-4 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-white outline-none focus:border-sky-500"
              autoFocus
            />
            <label className="mb-1 block text-sm text-slate-300">
              No. Referensi {(method === 'gofood' || method === 'grabfood') && '(No. order platform)'}
            </label>
            <input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              className="mb-4 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-white outline-none focus:border-sky-500"
            />
          </>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg bg-slate-700 py-3 text-white hover:bg-slate-600">
            Batal
          </button>
          <button
            onClick={submit}
            disabled={busy || amountToApply <= 0}
            className="flex-1 rounded-lg bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? 'Memproses...' : 'Konfirmasi'}
          </button>
        </div>
      </div>
    </div>
  );
}
