import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatRupiah } from '@fnb/shared';
import { api, ApiError } from '../api/client';
import { useAuthStore } from '../store/auth';
import PaymentModal from '../components/PaymentModal';
import ExpenseModal from '../components/ExpenseModal';
import type { CategoryDto, MenuItemDto, OrderSummaryDto, OrderType, ShiftDto } from '../api/types';

interface CartLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  dine_in: 'Dine In',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

export default function Home() {
  const navigate = useNavigate();
  const { user, clearSession } = useAuthStore();

  const [shift, setShift] = useState<ShiftDto | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showExpense, setShowExpense] = useState(false);

  const [openBills, setOpenBills] = useState<OrderSummaryDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemDto[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [customerLabel, setCustomerLabel] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<{ orderId: string; remainingDue: number } | null>(null);

  async function loadShift() {
    setShiftLoading(true);
    try {
      const res = await api.get<{ shift: ShiftDto | null }>('/shifts/current');
      setShift(res.shift);
    } catch (err) {
      if (err instanceof ApiError) setShiftError(err.message);
    } finally {
      setShiftLoading(false);
    }
  }

  async function loadMenu() {
    const [catRes, itemRes] = await Promise.all([
      api.get<{ categories: CategoryDto[] }>('/categories'),
      api.get<{ menuItems: MenuItemDto[] }>('/menu-items'),
    ]);
    setCategories(catRes.categories);
    setMenuItems(itemRes.menuItems);
  }

  async function loadOpenBills() {
    const res = await api.get<{ orders: OrderSummaryDto[] }>('/orders?status=open');
    setOpenBills(res.orders);
  }

  useEffect(() => {
    loadShift();
  }, []);

  useEffect(() => {
    if (!shift) return;
    loadMenu().catch((err) => setError(err instanceof ApiError ? err.message : 'Gagal memuat menu'));
    loadOpenBills().catch((err) => setError(err instanceof ApiError ? err.message : 'Gagal memuat bill terbuka'));
  }, [shift?.id]);

  const visibleItems = useMemo(
    () => menuItems.filter((m) => m.is_active && (activeCategory === 'all' || m.category_id === activeCategory)),
    [menuItems, activeCategory],
  );

  function addToCart(item: MenuItemDto) {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) return prev.map((l) => (l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { menuItemId: item.id, name: item.name, price: Number(item.price), quantity: 1 }];
    });
  }

  function changeQty(menuItemId: string, delta: number) {
    setCart((prev) => prev.map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0));
  }

  const cartTotal = cart.reduce((sum, l) => sum + l.price * l.quantity, 0);

  function resetCart() {
    setCart([]);
    setCustomerLabel('');
  }

  async function saveBill() {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const items = cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, modifierIds: [] }));
      const res = await api.post<{ order: { order_number: string } }>('/orders', {
        orderType,
        customerLabel: customerLabel.trim() || undefined,
        items,
      });
      resetCart();
      await loadOpenBills();
      setSuccessMessage(`Bill #${res.order.order_number} tersimpan sbg bill terbuka.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      handleOrderError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function payNow() {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const items = cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, modifierIds: [] }));
      const res = await api.post<{ order: { id: string; grand_total?: number } }>('/orders', {
        orderType,
        customerLabel: customerLabel.trim() || undefined,
        items,
      });
      setPendingPayment({ orderId: res.order.id, remainingDue: cartTotal });
    } catch (err) {
      handleOrderError(err);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOrderError(err: unknown) {
    if (err instanceof ApiError) {
      if (err.status === 409 && err.body && typeof err.body === 'object' && 'shortages' in err.body) {
        const shortages = (err.body as { shortages: { name: string; available: number; unit: string }[] }).shortages;
        setError(`Stok tidak cukup: ${shortages.map((s) => `${s.name} (sisa ${s.available} ${s.unit})`).join(', ')}`);
      } else {
        setError(err.message);
      }
    }
  }

  if (shiftLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400">Memuat...</div>;
  }

  if (!shift) {
    return <OpenShiftScreen error={shiftError} onOpened={(s) => setShift(s)} onLogout={() => { clearSession(); navigate('/login'); }} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 md:flex-row">
      {/* Menu */}
      <div className="flex-1 overflow-y-auto p-4">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm text-slate-400">{user?.fullName} &middot; Shift #{shift.shift_number}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigate('/reports')} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700">
              Laporan
            </button>
            <button onClick={() => setShowExpense(true)} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700">
              Catat Pengeluaran
            </button>
            <button onClick={() => setShowCloseShift(true)} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700">
              Tutup Shift
            </button>
            <button onClick={() => { clearSession(); navigate('/login'); }} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700">
              Keluar
            </button>
          </div>
        </header>

        {error && <div className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
        {successMessage && <div className="mb-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">{successMessage}</div>}

        {openBills.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Bill Terbuka ({openBills.length})</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {openBills.map((b) => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/bill/${b.id}`)}
                  className="shrink-0 rounded-xl bg-amber-500/15 border border-amber-500 px-4 py-2 text-left"
                >
                  <div className="text-sm font-semibold text-amber-300">{b.customer_label || b.order_number}</div>
                  <div className="text-xs text-amber-400/80">{ORDER_TYPE_LABELS[b.order_type]} &middot; {formatRupiah(Number(b.grand_total))}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-3 flex gap-2">
          {(Object.keys(ORDER_TYPE_LABELS) as OrderType[]).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${orderType === t ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-300'}`}
            >
              {ORDER_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCategory('all')}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${activeCategory === 'all' ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-300'}`}
          >
            Semua
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${activeCategory === c.id ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-300'}`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              onClick={() => addToCart(item)}
              className="rounded-xl bg-slate-800 p-4 text-left transition hover:bg-slate-700 active:scale-95"
            >
              <div className="font-semibold text-white">{item.name}</div>
              <div className="mt-1 text-sm text-sky-400">{formatRupiah(Number(item.price))}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Cart */}
      <div className="flex w-full flex-col border-t border-slate-800 bg-slate-950 p-4 md:w-96 md:border-l md:border-t-0">
        <h2 className="mb-3 text-lg font-bold text-white">Order Baru ({ORDER_TYPE_LABELS[orderType]})</h2>

        <label className="mb-1 block text-xs text-slate-500">Label pelanggan (opsional)</label>
        <input
          value={customerLabel}
          onChange={(e) => setCustomerLabel(e.target.value)}
          placeholder="mis. nama, Meja A, No. GoFood"
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
        />

        {cart.length === 0 ? (
          <p className="text-sm text-slate-500">Keranjang kosong -- pilih produk di sebelah kiri.</p>
        ) : (
          <div className="mb-4 space-y-2">
            {cart.map((l) => (
              <div key={l.menuItemId} className="flex items-center justify-between text-sm">
                <span className="text-white">{l.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => changeQty(l.menuItemId, -1)} className="h-6 w-6 rounded bg-slate-800 text-slate-300">-</button>
                  <span className="w-5 text-center text-white">{l.quantity}</span>
                  <button onClick={() => changeQty(l.menuItemId, 1)} className="h-6 w-6 rounded bg-slate-800 text-slate-300">+</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto space-y-2">
          <div className="flex justify-between text-base font-bold text-white">
            <span>Total</span>
            <span>{formatRupiah(cartTotal)}</span>
          </div>

          <button
            onClick={saveBill}
            disabled={cart.length === 0 || submitting}
            className="w-full rounded-lg bg-slate-700 py-3 font-semibold text-white hover:bg-slate-600 disabled:opacity-50"
          >
            {submitting ? 'Menyimpan...' : 'Simpan sbg Bill Terbuka'}
          </button>
          <button
            onClick={payNow}
            disabled={cart.length === 0 || submitting}
            className="w-full rounded-lg bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
          >
            {submitting ? 'Memproses...' : 'Bayar Sekarang'}
          </button>
        </div>
      </div>

      {pendingPayment && (
        <PaymentModal
          orderId={pendingPayment.orderId}
          remainingDue={pendingPayment.remainingDue}
          onClose={() => setPendingPayment(null)}
          onPaid={() => {
            setPendingPayment(null);
            resetCart();
          }}
        />
      )}

      {showExpense && (
        <ExpenseModal onClose={() => setShowExpense(false)} onSaved={() => setShowExpense(false)} />
      )}

      {showCloseShift && (
        <CloseShiftModal
          shift={shift}
          onClose={() => setShowCloseShift(false)}
          onClosed={() => {
            setShowCloseShift(false);
            setShift(null);
          }}
        />
      )}
    </div>
  );
}

function OpenShiftScreen({ error, onOpened, onLogout }: { error: string | null; onOpened: (s: ShiftDto) => void; onLogout: () => void }) {
  const navigate = useNavigate();
  const [openingCash, setOpeningCash] = useState(0);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setLocalError(null);
    try {
      const res = await api.post<{ shift: ShiftDto }>('/shifts/open', { openingCash });
      onOpened(res.shift);
    } catch (err) {
      if (err instanceof ApiError) setLocalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-6">
        <h1 className="mb-1 text-xl font-bold text-white">Buka Shift</h1>
        <p className="mb-6 text-sm text-slate-400">Belum ada shift yang terbuka di outlet ini. Masukkan modal kas awal untuk mulai.</p>

        {(error || localError) && <div className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error || localError}</div>}

        <label className="mb-1 block text-sm text-slate-300">Kas awal</label>
        <input
          type="number"
          value={openingCash}
          onChange={(e) => setOpeningCash(Number(e.target.value))}
          className="mb-6 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-white outline-none focus:border-sky-500"
          autoFocus
        />

        <button
          onClick={submit}
          disabled={busy}
          className="mb-3 w-full rounded-lg bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
        >
          {busy ? 'Membuka...' : 'Buka Shift'}
        </button>
        <button onClick={() => navigate('/reports')} className="mb-3 w-full rounded-lg bg-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-600">
          Laporan
        </button>
        <button onClick={onLogout} className="w-full rounded-lg bg-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-600">
          Keluar
        </button>
      </div>
    </div>
  );
}

function CloseShiftModal({ shift, onClose, onClosed }: { shift: ShiftDto; onClose: () => void; onClosed: () => void }) {
  const [expected, setExpected] = useState<number | null>(shift.runningExpectedCash ?? null);
  const [closingCashCounted, setClosingCashCounted] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ variance: number } | null>(null);

  useEffect(() => {
    api
      .get<{ shift: ShiftDto | null }>('/shifts/current')
      .then((res) => setExpected(res.shift?.runningExpectedCash ?? 0))
      .catch(() => {});
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ shift: ShiftDto }>(`/shifts/${shift.id}/close`, { closingCashCounted });
      setResult({ variance: Number(res.shift.cash_variance) });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409 && err.body && typeof err.body === 'object' && 'count' in err.body) {
          setError(`Masih ada ${(err.body as { count: number }).count} bill terbuka -- selesaikan/batalkan dulu sebelum tutup shift.`);
        } else {
          setError(err.message);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-6">
        <h3 className="mb-4 text-lg font-bold text-white">Tutup Shift #{shift.shift_number}</h3>

        {error && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

        {result ? (
          <>
            <p className="mb-2 text-slate-300">Shift ditutup.</p>
            <p className={`mb-6 text-lg font-bold ${result.variance === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              Selisih kas: {formatRupiah(result.variance)}
            </p>
            <button onClick={onClosed} className="w-full rounded-lg bg-sky-500 py-3 font-semibold text-white hover:bg-sky-600">
              Selesai
            </button>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-400">
              Kas seharusnya saat ini: <span className="font-semibold text-white">{expected != null ? formatRupiah(expected) : '...'}</span>
            </p>
            <label className="mb-1 block text-sm text-slate-300">Uang tunai dihitung</label>
            <input
              type="number"
              value={closingCashCounted}
              onChange={(e) => setClosingCashCounted(Number(e.target.value))}
              className="mb-6 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-white outline-none focus:border-sky-500"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-lg bg-slate-700 py-3 text-white hover:bg-slate-600">
                Batal
              </button>
              <button onClick={submit} disabled={busy} className="flex-1 rounded-lg bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-400 disabled:opacity-50">
                {busy ? 'Memproses...' : 'Tutup Shift'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
