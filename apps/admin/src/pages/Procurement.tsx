import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import OutletSelector from '../components/OutletSelector';
import { useOutletStore } from '../store/outlet';
import { api, ApiError } from '../api/client';

interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  status: 'open' | 'received' | 'cancelled';
  order_date: string;
  total_amount: string;
  notes: string | null;
  supplier_name: string;
  received_at: string | null;
  payment_status: 'unpaid' | 'paid';
  paid_at: string | null;
  payment_method: string | null;
}

interface PoDetail {
  purchaseOrder: PurchaseOrder & { supplier_id: string };
  items: {
    id: string;
    ingredient_id: string;
    ingredient_name: string;
    unit: string;
    quantity: string;
    unit_cost: string;
    subtotal: string;
  }[];
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  current_stock: string;
}

interface PayableRow {
  supplier_id: string;
  supplier_name: string;
  po_count: string;
  total_due: string;
  oldest_order_date: string;
}

const STATUS_LABELS: Record<string, string> = { open: 'Dipesan', received: 'Diterima', cancelled: 'Dibatalkan' };
const PAYMENT_LABELS: Record<string, string> = { cash: 'Tunai', transfer: 'Transfer', other: 'Lainnya' };
const STATUS_STYLES: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700',
  received: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

export default function Procurement() {
  const [tab, setTab] = useState<'po' | 'payable' | 'supplier'>('po');
  const activeOutletId = useOutletStore((s) => s.activeOutletId);

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Pembelian</h1>
        <OutletSelector />
      </div>

      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setTab('po')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === 'po' ? 'bg-sky-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
        >
          Purchase Order
        </button>
        <button
          onClick={() => setTab('payable')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === 'payable' ? 'bg-sky-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
        >
          Utang Supplier
        </button>
        <button
          onClick={() => setTab('supplier')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === 'supplier' ? 'bg-sky-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
        >
          Supplier
        </button>
      </div>

      {tab === 'po' && <PurchaseOrdersTab activeOutletId={activeOutletId} />}
      {tab === 'payable' && <PayablesTab activeOutletId={activeOutletId} />}
      {tab === 'supplier' && <SuppliersTab />}
    </Layout>
  );
}

// --- Purchase orders -------------------------------------------------------

function PurchaseOrdersTab({ activeOutletId }: { activeOutletId: string | null }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<PoDetail | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [poRes, supRes, ingRes] = await Promise.all([
        api.get<{ purchaseOrders: PurchaseOrder[] }>('/purchase-orders'),
        api.get<{ suppliers: Supplier[] }>('/suppliers'),
        api.get<{ ingredients: Ingredient[] }>('/ingredients'),
      ]);
      setOrders(poRes.purchaseOrders);
      setSuppliers(supRes.suppliers.filter((s) => s.is_active));
      setIngredients(ingRes.ingredients);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOutletId]);

  async function openDetail(id: string) {
    try {
      setDetail(await api.get<PoDetail>(`/purchase-orders/${id}`));
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function receive(id: string) {
    if (!window.confirm('Tandai PO ini sebagai diterima? Stok bahan akan otomatis bertambah.')) return;
    try {
      await api.post(`/purchase-orders/${id}/receive`);
      setDetail(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function pay(id: string, method: string) {
    try {
      await api.post(`/purchase-orders/${id}/pay`, { paymentMethod: method });
      setDetail(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function cancel(id: string) {
    if (!window.confirm('Batalkan PO ini?')) return;
    try {
      await api.post(`/purchase-orders/${id}/cancel`);
      setDetail(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  return (
    <>
      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <button onClick={() => setShowCreate(true)} className="mb-4 rounded-lg bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-600">
        + Buat Purchase Order
      </button>

      {loading ? (
        <p className="text-slate-500">Memuat...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">No. PO</th>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Bayar</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((po) => (
                <tr key={po.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{po.po_number}</td>
                  <td className="px-4 py-3 text-slate-600">{new Date(po.order_date).toLocaleDateString('id-ID')}</td>
                  <td className="px-4 py-3 text-slate-900">{po.supplier_name}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatRupiah(Number(po.total_amount))}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[po.status]}`}>
                      {STATUS_LABELS[po.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {po.status === 'cancelled' ? (
                      <span className="text-xs text-slate-400">-</span>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${po.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {po.payment_status === 'paid' ? 'Dibayar' : 'Belum'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openDetail(po.id)} className="text-xs text-sky-600 hover:text-sky-800">Detail</button>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-400">Belum ada purchase order</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreatePoModal
          suppliers={suppliers}
          ingredients={ingredients}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await load();
          }}
        />
      )}

      {detail && (
        <PoDetailModal detail={detail} onClose={() => setDetail(null)} onReceive={receive} onCancel={cancel} onPay={pay} />
      )}
    </>
  );
}

function CreatePoModal({
  suppliers,
  ingredients,
  onClose,
  onCreated,
}: {
  suppliers: Supplier[];
  ingredients: Ingredient[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<{ ingredientId: string; quantity: number; unitCost: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addLine() {
    if (ingredients.length === 0) return;
    setLines((prev) => [...prev, { ingredientId: ingredients[0].id, quantity: 1, unitCost: 0 }]);
  }

  function updateLine(idx: number, patch: Partial<{ ingredientId: string; quantity: number; unitCost: number }>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);

  async function submit() {
    setError(null);
    if (!supplierId) {
      setError('Pilih supplier dulu (buat di tab Supplier kalau belum ada)');
      return;
    }
    if (lines.length === 0) {
      setError('Tambah minimal 1 item');
      return;
    }
    setBusy(true);
    try {
      await api.post('/purchase-orders', { supplierId, notes: notes.trim() || undefined, items: lines });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6">
        <h3 className="mb-4 text-lg font-bold text-slate-900">Buat Purchase Order</h3>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <div className="mb-4 flex flex-wrap gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Supplier</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-56 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500">
              {suppliers.length === 0 && <option value="">-- belum ada supplier --</option>}
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-slate-500">Catatan</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Item</span>
          <button onClick={addLine} disabled={ingredients.length === 0} className="text-xs text-sky-600 hover:text-sky-800 disabled:opacity-40">+ Tambah item</button>
        </div>

        {ingredients.length === 0 && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Outlet ini belum punya bahan. Tambahkan dulu di menu Bahan &amp; Stok.
          </p>
        )}

        <div className="mb-4 space-y-2">
          {lines.map((l, idx) => {
            const ing = ingredients.find((i) => i.id === l.ingredientId);
            return (
              <div key={idx} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-slate-500">Bahan</label>
                  <select value={l.ingredientId} onChange={(e) => updateLine(idx, { ingredientId: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky-500">
                    {ingredients.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <label className="mb-1 block text-xs text-slate-500">Qty {ing ? `(${ing.unit})` : ''}</label>
                  <input type="number" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky-500" />
                </div>
                <div className="w-32">
                  <label className="mb-1 block text-xs text-slate-500">Harga/unit</label>
                  <input type="number" value={l.unitCost} onChange={(e) => updateLine(idx, { unitCost: Number(e.target.value) })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky-500" />
                </div>
                <div className="w-28 text-right">
                  <div className="text-xs text-slate-500">Subtotal</div>
                  <div className="text-sm font-medium text-slate-900">{formatRupiah(l.quantity * l.unitCost)}</div>
                </div>
                <button onClick={() => removeLine(idx)} className="pb-1.5 text-xs text-red-500 hover:text-red-700">Hapus</button>
              </div>
            );
          })}
          {lines.length === 0 && <p className="text-sm text-slate-400">Belum ada item.</p>}
        </div>

        <div className="mb-6 flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900">
          <span>Total</span>
          <span>{formatRupiah(total)}</span>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">Batal</button>
          <button onClick={submit} disabled={busy} className="flex-1 rounded-lg bg-sky-500 py-2.5 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
            {busy ? 'Menyimpan...' : 'Simpan PO'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PoDetailModal({
  detail,
  onClose,
  onReceive,
  onCancel,
  onPay,
}: {
  detail: PoDetail;
  onClose: () => void;
  onReceive: (id: string) => void;
  onCancel: (id: string) => void;
  onPay: (id: string, method: string) => void;
}) {
  const po = detail.purchaseOrder;
  const [payMethod, setPayMethod] = useState('transfer');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
        <h3 className="mb-1 text-lg font-bold text-slate-900">{po.po_number}</h3>
        <p className="mb-4 text-sm text-slate-500">
          {po.supplier_name} &middot; {new Date(po.order_date).toLocaleDateString('id-ID')} &middot;{' '}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[po.status]}`}>{STATUS_LABELS[po.status]}</span>
        </p>

        <table className="mb-4 w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-1 text-left">Bahan</th>
              <th className="py-1 text-right">Qty</th>
              <th className="py-1 text-right">Harga</th>
              <th className="py-1 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((it) => (
              <tr key={it.id} className="border-t border-slate-100">
                <td className="py-2 text-slate-700">{it.ingredient_name}</td>
                <td className="py-2 text-right text-slate-600">{Number(it.quantity)} {it.unit}</td>
                <td className="py-2 text-right text-slate-600">{formatRupiah(Number(it.unit_cost))}</td>
                <td className="py-2 text-right font-medium text-slate-900">{formatRupiah(Number(it.subtotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mb-6 flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900">
          <span>Total</span>
          <span>{formatRupiah(Number(po.total_amount))}</span>
        </div>

        {po.notes && <p className="mb-4 text-sm text-slate-500">Catatan: {po.notes}</p>}

        <div className="mb-4 rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Pembayaran</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${po.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {po.payment_status === 'paid' ? 'Dibayar' : 'Belum dibayar'}
            </span>
          </div>
          {po.payment_status === 'paid' ? (
            <p className="text-xs text-slate-500">
              {po.paid_at && new Date(po.paid_at).toLocaleString('id-ID')}
              {po.payment_method && ` -- ${PAYMENT_LABELS[po.payment_method] ?? po.payment_method}`}
            </p>
          ) : po.status !== 'cancelled' ? (
            <div className="flex flex-wrap items-center gap-2">
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky-500">
                <option value="transfer">Transfer</option>
                <option value="cash">Tunai</option>
                <option value="other">Lainnya</option>
              </select>
              <button onClick={() => onPay(po.id, payMethod)} className="rounded-lg bg-emerald-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600">
                Tandai Dibayar
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400">PO dibatalkan.</p>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">Tutup</button>
          {po.status === 'open' && (
            <>
              <button onClick={() => onCancel(po.id)} className="rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100">
                Batalkan
              </button>
              <button onClick={() => onReceive(po.id)} className="flex-1 rounded-lg bg-emerald-500 py-2.5 font-medium text-white hover:bg-emerald-600">
                Terima Barang
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


// --- Payables ---------------------------------------------------------------

function PayablesTab({ activeOutletId }: { activeOutletId: string | null }) {
  const [rows, setRows] = useState<PayableRow[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [unpaidPos, setUnpaidPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [pay, pos] = await Promise.all([
        api.get<{ totalDue: number; suppliers: PayableRow[] }>('/payables'),
        api.get<{ purchaseOrders: PurchaseOrder[] }>('/purchase-orders?paymentStatus=unpaid'),
      ]);
      setRows(pay.suppliers);
      setTotalDue(pay.totalDue);
      setUnpaidPos(pos.purchaseOrders.filter((p) => p.status !== 'cancelled'));
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOutletId]);

  if (loading) return <p className="text-slate-500">Memuat...</p>;

  return (
    <>
      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs text-slate-500">Total utang ke supplier (outlet ini)</div>
        <div className={`mt-1 text-2xl font-bold ${totalDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatRupiah(totalDue)}</div>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-700">Per Supplier</h2>
      <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3 text-right">Jml PO</th>
              <th className="px-4 py-3">PO terlama</th>
              <th className="px-4 py-3 text-right">Total Utang</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.supplier_id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">{r.supplier_name}</td>
                <td className="px-4 py-3 text-right text-slate-600">{r.po_count}</td>
                <td className="px-4 py-3 text-slate-600">{new Date(r.oldest_order_date).toLocaleDateString('id-ID')}</td>
                <td className="px-4 py-3 text-right font-semibold text-red-600">{formatRupiah(Number(r.total_due))}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">Tidak ada utang -- semua PO sudah dibayar</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-700">PO Belum Dibayar</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">No. PO</th>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Barang</th>
              <th className="px-4 py-3 text-right">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {unpaidPos.map((po) => (
              <tr key={po.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{po.po_number}</td>
                <td className="px-4 py-3 text-slate-600">{new Date(po.order_date).toLocaleDateString('id-ID')}</td>
                <td className="px-4 py-3 text-slate-900">{po.supplier_name}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[po.status]}`}>{STATUS_LABELS[po.status]}</span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">{formatRupiah(Number(po.total_amount))}</td>
              </tr>
            ))}
            {unpaidPos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">Tidak ada PO yang belum dibayar</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Tandai PO sebagai dibayar lewat tab <strong>Purchase Order</strong> &rarr; buka detail PO-nya.
      </p>
    </>
  );
}

// --- Suppliers -------------------------------------------------------------

function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ suppliers: Supplier[] }>('/suppliers');
      setSuppliers(res.suppliers);
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
    setFormError(null);
    if (!name.trim()) {
      setFormError('Nama supplier wajib diisi');
      return;
    }
    setCreating(true);
    try {
      await api.post('/suppliers', {
        name: name.trim(),
        contactPerson: contactPerson.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setName('');
      setContactPerson('');
      setPhone('');
      setShowForm(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(s: Supplier) {
    try {
      await api.put(`/suppliers/${s.id}`, { isActive: !s.is_active });
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  return (
    <>
      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <p className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">
        Supplier dipakai bersama oleh semua outlet -- cukup didaftarkan sekali.
      </p>

      <button
        onClick={() => { setFormError(null); setShowForm(true); }}
        className="mb-4 rounded-lg bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-600"
      >
        + Tambah Supplier
      </button>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleCreate} className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-lg font-bold text-slate-900">Tambah Supplier</h2>
            {formError && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>}

            <label className="mb-1 block text-xs text-slate-500">Nama</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" autoFocus />

            <label className="mb-1 block text-xs text-slate-500">Kontak person</label>
            <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

            <label className="mb-1 block text-xs text-slate-500">Telepon</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">
                Batal
              </button>
              <button type="submit" disabled={creating} className="flex-1 rounded-lg bg-sky-500 py-2.5 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
                {creating ? 'Menyimpan...' : 'Tambah'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Memuat...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Kontak</th>
                <th className="px-4 py-3">Telepon</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.contact_person ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{s.phone ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => toggleActive(s)} className="text-xs text-red-500 hover:text-red-700">
                      {s.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">Belum ada supplier</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
