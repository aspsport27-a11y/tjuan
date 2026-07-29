import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatRupiah } from '@fnb/shared';
import { api, ApiError } from '../api/client';
import type { CategoryDto, MenuItemDto, OrderDetailResponse, OrderSummaryDto } from '../api/types';
import { useAuthStore } from '../store/auth';

interface CartLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

export default function Order() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemDto[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [existingOrder, setExistingOrder] = useState<OrderDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  async function loadMenu() {
    const [catRes, itemRes] = await Promise.all([
      api.get<{ categories: CategoryDto[] }>('/categories'),
      api.get<{ menuItems: MenuItemDto[] }>('/menu-items'),
    ]);
    setCategories(catRes.categories);
    setMenuItems(itemRes.menuItems);
  }

  async function loadExistingOrder() {
    const res = await api.get<{ orders: OrderSummaryDto[] }>(`/orders?status=open&tableSessionId=${sessionId}`);
    if (res.orders.length > 0) {
      const detail = await api.get<OrderDetailResponse>(`/orders/${res.orders[0].id}`);
      setExistingOrder(detail);
    } else {
      setExistingOrder(null);
    }
  }

  useEffect(() => {
    loadMenu().catch((err) => setError(err instanceof ApiError ? err.message : 'Gagal memuat menu'));
    loadExistingOrder().catch((err) => setError(err instanceof ApiError ? err.message : 'Gagal memuat order'));
  }, [sessionId]);

  const visibleItems = useMemo(
    () => menuItems.filter((m) => m.is_active && (activeCategory === 'all' || m.category_id === activeCategory)),
    [menuItems, activeCategory],
  );

  function addToCart(item: MenuItemDto) {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) {
        return prev.map((l) => (l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: Number(item.price), quantity: 1 }];
    });
  }

  function changeQty(menuItemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  const cartTotal = cart.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const existingTotal = existingOrder ? Number(existingOrder.order.grand_total) : 0;

  async function submitCart() {
    if (cart.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const items = cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, modifierIds: [] }));
      if (existingOrder) {
        await api.post(`/orders/${existingOrder.order.id}/items`, { items });
      } else {
        await api.post('/orders', { tableSessionId: sessionId, items });
      }
      setCart([]);
      await loadExistingOrder();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409 && err.body && typeof err.body === 'object' && 'shortages' in err.body) {
          const shortages = (err.body as { shortages: { name: string; available: number; unit: string }[] }).shortages;
          setError(`Stok tidak cukup: ${shortages.map((s) => `${s.name} (sisa ${s.available} ${s.unit})`).join(', ')}`);
        } else {
          setError(err.message);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelOrderItem(itemId: string) {
    try {
      await api.post(`/order-items/${itemId}/cancel`);
      await loadExistingOrder();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function closeSession() {
    try {
      await api.post(`/table-sessions/${sessionId}/close`);
      navigate('/tables');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  const orderCompleted = existingOrder?.order.status === 'completed';

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 md:flex-row">
      {/* Menu */}
      <div className="flex-1 overflow-y-auto p-4">
        <button onClick={() => navigate('/tables')} className="mb-4 text-sm text-slate-400 hover:text-white">
          &larr; Kembali ke meja
        </button>

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
              disabled={orderCompleted}
              className="rounded-xl bg-slate-800 p-4 text-left transition hover:bg-slate-700 active:scale-95 disabled:opacity-40"
            >
              <div className="font-semibold text-white">{item.name}</div>
              <div className="mt-1 text-sm text-sky-400">{formatRupiah(Number(item.price))}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Cart / order summary */}
      <div className="flex w-full flex-col border-t border-slate-800 bg-slate-950 p-4 md:w-96 md:border-l md:border-t-0">
        <h2 className="mb-3 text-lg font-bold text-white">
          Order {existingOrder ? `#${existingOrder.order.order_number}` : '(belum dikirim)'}
        </h2>

        {error && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

        {existingOrder && existingOrder.items.length > 0 && (
          <div className="mb-4 space-y-2 border-b border-slate-800 pb-4">
            {existingOrder.items.map((it) => (
              <div key={it.id} className={`flex items-center justify-between text-sm ${it.status === 'cancelled' ? 'opacity-40 line-through' : ''}`}>
                <div>
                  <div className="text-white">{it.quantity}x {it.item_name_snapshot}</div>
                  <div className="text-xs text-slate-500">{formatRupiah(Number(it.line_total))}</div>
                </div>
                {it.status === 'active' && hasPermission('order.cancel') && !orderCompleted && (
                  <button onClick={() => cancelOrderItem(it.id)} className="text-xs text-red-400 hover:text-red-300">
                    Batal
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Belum dikirim</div>
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
          <div className="flex justify-between text-sm text-slate-400">
            <span>Belum dikirim</span>
            <span>{formatRupiah(cartTotal)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-white">
            <span>Total order</span>
            <span>{formatRupiah(existingTotal + cartTotal)}</span>
          </div>

          {cart.length > 0 && !orderCompleted && (
            <button
              onClick={submitCart}
              disabled={submitting}
              className="w-full rounded-lg bg-sky-500 py-3 font-semibold text-white hover:bg-sky-400 disabled:opacity-50"
            >
              {submitting ? 'Mengirim...' : 'Kirim Order'}
            </button>
          )}

          {existingOrder && !orderCompleted && existingOrder.items.some((i) => i.status === 'active') && hasPermission('payment.create') && (
            <button onClick={() => setShowPayment(true)} className="w-full rounded-lg bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-400">
              Bayar
            </button>
          )}

          {orderCompleted && (
            <button onClick={closeSession} className="w-full rounded-lg bg-slate-700 py-3 font-semibold text-white hover:bg-slate-600">
              Tutup Meja
            </button>
          )}
        </div>
      </div>

      {showPayment && existingOrder && (
        <PaymentModal
          orderId={existingOrder.order.id}
          amountDue={existingTotal}
          onClose={() => setShowPayment(false)}
          onPaid={async () => {
            setShowPayment(false);
            await loadExistingOrder();
          }}
        />
      )}
    </div>
  );
}

function PaymentModal({
  orderId,
  amountDue,
  onClose,
  onPaid,
}: {
  orderId: string;
  amountDue: number;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [method, setMethod] = useState<'cash' | 'qris' | 'card' | 'transfer'>('cash');
  const [amount, setAmount] = useState(amountDue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/orders/${orderId}/payments`, { method, amount });
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
        <h3 className="mb-4 text-lg font-bold text-white">Pembayaran</h3>
        <p className="mb-4 text-slate-300">Total: {formatRupiah(amountDue)}</p>

        {error && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

        <div className="mb-4 grid grid-cols-4 gap-2">
          {(['cash', 'qris', 'card', 'transfer'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`rounded-lg py-2 text-xs font-medium capitalize ${method === m ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              {m}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-sm text-slate-300">Jumlah dibayar</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="mb-6 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-white outline-none focus:border-sky-500"
        />

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg bg-slate-700 py-3 text-white hover:bg-slate-600">
            Batal
          </button>
          <button onClick={submit} disabled={busy || amount <= 0} className="flex-1 rounded-lg bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-400 disabled:opacity-50">
            {busy ? 'Memproses...' : 'Konfirmasi'}
          </button>
        </div>
      </div>
    </div>
  );
}
