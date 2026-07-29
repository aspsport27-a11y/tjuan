-- =========================================================================
-- PO payment tracking + supplier payables.
--
-- Payment is modelled as a SEPARATE axis from the goods status, not as a
-- third value in it: a PO can be received but unpaid (that's a payable), or
-- paid up front before delivery. A linear open->received->paid enum could
-- express neither.
-- =========================================================================

ALTER TABLE purchase_orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'paid'));
ALTER TABLE purchase_orders ADD COLUMN paid_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN paid_by UUID REFERENCES users(id);
ALTER TABLE purchase_orders ADD COLUMN payment_method TEXT
  CHECK (payment_method IN ('cash', 'transfer', 'other'));

-- A paid PO without a date can't be placed in any period's cash flow.
ALTER TABLE purchase_orders ADD CONSTRAINT po_paid_requires_date
  CHECK (payment_status <> 'paid' OR paid_at IS NOT NULL);

CREATE INDEX idx_po_payment ON purchase_orders(outlet_id, payment_status);
