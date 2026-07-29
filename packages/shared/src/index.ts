// Types shared between the API and the two frontends (pos, admin).
// Kept intentionally small for MVP — grows as endpoints stabilize.

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type OrderStatus = 'open' | 'completed' | 'cancelled';
export type PaymentMethod = 'cash' | 'qris' | 'card' | 'transfer';
export type TableStatus = 'available' | 'occupied' | 'reserved';

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Modifier {
  id: string;
  name: string;
  priceDelta: number;
}

export interface MenuItem {
  id: string;
  categoryId: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  trackStock: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface DiningTable {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  openSessionId: string | null;
}

export interface OrderItemModifierView {
  id: string;
  modifierId: string | null;
  name: string;
  priceDelta: number;
}

export interface OrderItemView {
  id: string;
  menuItemId: string | null;
  itemNameSnapshot: string;
  unitPriceSnapshot: number;
  quantity: number;
  notes: string | null;
  status: 'active' | 'cancelled';
  lineTotal: number;
  modifiers: OrderItemModifierView[];
}

/** Formats a number as Indonesian Rupiah, e.g. formatRupiah(25000) -> "Rp25.000". */
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
