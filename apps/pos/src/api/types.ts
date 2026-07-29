// Response shapes as actually returned by the API today. Some endpoints
// mix snake_case (straight from Postgres rows) and camelCase (computed
// fields) -- see docs/TECH_DEBT.md "API response casing is inconsistent".
// Typed here as-is rather than papering over it, so a future normalization
// pass has one obvious place to fix.

export interface CategoryDto {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface MenuItemDto {
  id: string;
  category_id: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  price: string; // numeric comes back as string from pg
  image_url: string | null;
  track_stock: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface TableDto {
  id: string;
  name: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved';
  sort_order: number;
  open_session_id: string | null;
}

export interface TableSessionDto {
  id: string;
  table_id: string | null;
  order_type: 'dine_in' | 'takeaway' | 'delivery';
  status: 'open' | 'closed';
  guest_count: number | null;
  opened_at: string;
}

export interface OrderSummaryDto {
  id: string;
  order_number: string;
  table_session_id: string | null;
  status: 'open' | 'completed' | 'cancelled';
  subtotal: string;
  discount_total: string;
  tax_total: string;
  service_charge_total: string;
  grand_total: string;
  created_at: string;
}

export interface OrderItemModifierDto {
  id: string;
  modifierId: string | null;
  name: string;
  priceDelta: string;
}

export interface OrderItemDto {
  id: string;
  menu_item_id: string | null;
  item_name_snapshot: string;
  unit_price_snapshot: string;
  quantity: string;
  notes: string | null;
  status: 'active' | 'cancelled';
  line_total: string;
  modifiers: OrderItemModifierDto[];
}

export interface PaymentDto {
  id: string;
  method: 'cash' | 'qris' | 'card' | 'transfer';
  amount: string;
  reference_no: string | null;
  paid_at: string;
}

export interface OrderDetailResponse {
  order: OrderSummaryDto;
  items: OrderItemDto[];
  payments: PaymentDto[];
}
