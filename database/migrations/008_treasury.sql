-- =========================================================================
-- Kas & Bank (treasury). Modelled on the ASP Sport treasury module:
-- accounts + a single append-only ledger, with balance derived rather than
-- stored, so a balance can always be explained by the rows behind it.
--
-- Money flow this supports:
--   POS non-cash  -> settlement -> outlet/central account (net of platform fees)
--   POS cash      -> shift drawer -> cash deposit -> account
--   account       -> expense / supplier payment (money out)
--   account       -> transfer -> account (sweep outlet to central)
-- =========================================================================

CREATE TABLE accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = central/holding account, usable by every outlet (owner level).
  outlet_id       UUID REFERENCES outlets(id),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'ewallet')),
  bank_name       TEXT,
  account_number  TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_accounts_outlet ON accounts(outlet_id);

-- Append-only ledger. Never updated in place: a correction is another row,
-- so history stays auditable.
CREATE TABLE account_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES accounts(id),
  direction      TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  kind           TEXT NOT NULL CHECK (kind IN (
                   'cash_deposit', 'settlement', 'expense', 'purchase_payment',
                   'transfer_in', 'transfer_out', 'adjustment'
                 )),
  reference_type TEXT,   -- e.g. 'outlet_expense', 'purchase_order', 'cash_deposit'
  reference_id   UUID,
  tx_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  notes          TEXT,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_account_tx_account_date ON account_transactions(account_id, tx_date DESC, created_at DESC);
CREATE INDEX idx_account_tx_reference ON account_transactions(reference_type, reference_id);

-- Physical cash counted out of shift drawers and banked/handed over.
CREATE TABLE cash_deposits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     UUID NOT NULL REFERENCES outlets(id),
  to_account_id UUID NOT NULL REFERENCES accounts(id),
  shift_id      UUID REFERENCES shifts(id),  -- null = lump deposit across shifts
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  deposit_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_deposits_outlet ON cash_deposits(outlet_id, deposit_date DESC);
-- One deposit per shift: without this a shift's cash could be banked twice.
CREATE UNIQUE INDEX idx_cash_deposits_shift ON cash_deposits(shift_id) WHERE shift_id IS NOT NULL;

-- Non-cash reconciliation: what the POS recorded vs what actually landed in
-- the account. The gap is the platform/payment fee -- GoFood and GrabFood
-- withhold commission, so sales value never equals money received.
CREATE TABLE settlements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id      UUID NOT NULL REFERENCES outlets(id),
  method         TEXT NOT NULL CHECK (method IN ('qris', 'card', 'transfer', 'gofood', 'grabfood')),
  period_from    DATE NOT NULL,
  period_to      DATE NOT NULL,
  system_amount  NUMERIC(14,2) NOT NULL,          -- summed from payments
  actual_amount  NUMERIC(14,2) NOT NULL,          -- what the bank/platform actually paid
  fee_amount     NUMERIC(14,2) NOT NULL DEFAULT 0, -- system - actual
  to_account_id  UUID NOT NULL REFERENCES accounts(id),
  notes          TEXT,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_to >= period_from)
);

CREATE INDEX idx_settlements_outlet ON settlements(outlet_id, period_to DESC);

-- Which account money left when an expense or a supplier payment happened.
-- Nullable: till expenses come out of the drawer, which is not an account,
-- and existing rows predate this.
ALTER TABLE outlet_expenses ADD COLUMN account_id UUID REFERENCES accounts(id);
ALTER TABLE purchase_orders ADD COLUMN paid_account_id UUID REFERENCES accounts(id);
