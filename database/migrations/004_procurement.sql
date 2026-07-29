-- =========================================================================
-- Phase C: procurement. Suppliers are GLOBAL (the same vendor plausibly
-- supplies all outlets, so re-entering them per outlet would be pure
-- duplication) -- it's the purchase orders that are outlet-scoped, which is
-- what "each outlet does its own procurement" actually means.
-- =========================================================================

CREATE TABLE suppliers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL UNIQUE,
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  notes          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Atomic per-outlet-per-day PO numbering (same pattern as
-- order_number_counters / shift_number_counters).
CREATE TABLE purchase_order_number_counters (
  outlet_id     UUID NOT NULL REFERENCES outlets(id),
  business_date DATE NOT NULL,
  counter       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (outlet_id, business_date)
);

CREATE TABLE purchase_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     UUID NOT NULL REFERENCES outlets(id),
  supplier_id   UUID NOT NULL REFERENCES suppliers(id),
  po_number     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'received', 'cancelled')),
  order_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by   UUID REFERENCES users(id),
  received_at   TIMESTAMPTZ,
  UNIQUE (outlet_id, po_number)
);

CREATE INDEX idx_purchase_orders_outlet_status ON purchase_orders(outlet_id, status);

CREATE TABLE purchase_order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  ingredient_id     UUID NOT NULL REFERENCES ingredients(id),
  quantity          NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost         NUMERIC(14,4) NOT NULL CHECK (unit_cost >= 0),
  subtotal          NUMERIC(14,2) NOT NULL
);

CREATE INDEX idx_purchase_order_items_po ON purchase_order_items(purchase_order_id);
