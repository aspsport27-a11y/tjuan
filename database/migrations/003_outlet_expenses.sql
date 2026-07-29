-- =========================================================================
-- Phase B: outlet cash expenses. Tied to a shift (NOT NULL) -- an expense
-- always draws from that shift's cash drawer, so it must exist to be
-- counted in cash reconciliation (same gate as orders/payments: no open
-- shift, no expense).
-- =========================================================================

CREATE TABLE outlet_expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     UUID NOT NULL REFERENCES outlets(id),
  shift_id      UUID NOT NULL REFERENCES shifts(id),
  category      TEXT NOT NULL CHECK (category IN ('bahan_baku', 'operasional', 'gaji', 'transport', 'lainnya')),
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  notes         TEXT,
  recorded_by   UUID REFERENCES users(id),
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outlet_expenses_outlet ON outlet_expenses(outlet_id, recorded_at DESC);
CREATE INDEX idx_outlet_expenses_shift ON outlet_expenses(shift_id);
