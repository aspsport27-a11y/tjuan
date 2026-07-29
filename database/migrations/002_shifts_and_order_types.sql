-- =========================================================================
-- Phase A2: cashier shifts + table-less order types (dine_in/takeaway/
-- delivery), delivery-platform payment methods (GoFood/GrabFood settle
-- non-cash, must not count toward cash-drawer reconciliation).
-- =========================================================================

-- Atomic per-outlet-per-day counter for shift numbering (mirrors
-- order_number_counters -- see orders.service.ts nextOrderNumber).
CREATE TABLE shift_number_counters (
  outlet_id     UUID NOT NULL REFERENCES outlets(id),
  business_date DATE NOT NULL,
  counter       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (outlet_id, business_date)
);

CREATE TABLE shifts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id             UUID NOT NULL REFERENCES outlets(id),
  shift_number          INTEGER NOT NULL,
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_cash          NUMERIC(14,2) NOT NULL,
  opened_by             UUID REFERENCES users(id),
  opened_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  closing_cash_counted  NUMERIC(14,2),
  expected_cash         NUMERIC(14,2),
  cash_variance         NUMERIC(14,2),
  closed_by             UUID REFERENCES users(id),
  closed_at             TIMESTAMPTZ,
  notes                 TEXT
);

-- One open shift per outlet at a time -- register-style, not per-cashier.
CREATE UNIQUE INDEX idx_shifts_one_open_per_outlet ON shifts(outlet_id) WHERE status = 'open';
CREATE INDEX idx_shifts_outlet_opened ON shifts(outlet_id, opened_at DESC);

-- order_type used to live only on table_sessions; the new quick-sale flow
-- doesn't use table sessions, so it moves onto orders directly.
ALTER TABLE orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'dine_in' CHECK (order_type IN ('dine_in', 'takeaway', 'delivery'));
ALTER TABLE orders ADD COLUMN customer_label TEXT; -- free text: "Meja A", a name, "GoFood #123" -- how a cashier finds an open bill again without formal table numbers.
ALTER TABLE orders ADD COLUMN shift_id UUID REFERENCES shifts(id);

-- Backfill order_type for pre-existing dine-in-table orders from their session.
UPDATE orders o SET order_type = ts.order_type FROM table_sessions ts WHERE o.table_session_id = ts.id;

ALTER TABLE payments ADD COLUMN shift_id UUID REFERENCES shifts(id);

ALTER TABLE payments DROP CONSTRAINT payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('cash', 'qris', 'card', 'transfer', 'gofood', 'grabfood'));

CREATE INDEX idx_orders_shift ON orders(shift_id);
CREATE INDEX idx_payments_shift ON payments(shift_id);
