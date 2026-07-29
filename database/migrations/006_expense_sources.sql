-- =========================================================================
-- Financial reporting groundwork: expenses split into two kinds.
--
--   cash_drawer -- money physically leaving the till during a shift.
--                  Requires an open shift; counts against expected cash.
--   outlet      -- outlet-level charges (gaji, sewa, listrik) usually paid
--                  from a bank account, often outside operating hours.
--                  No shift needed; must NOT affect drawer reconciliation.
--
-- Before this, every expense required an open shift, which made fixed costs
-- impossible to record at all -- and those are the biggest lines in a P&L.
-- =========================================================================

ALTER TABLE outlet_expenses ALTER COLUMN shift_id DROP NOT NULL;

ALTER TABLE outlet_expenses ADD COLUMN source TEXT NOT NULL DEFAULT 'cash_drawer'
  CHECK (source IN ('cash_drawer', 'outlet'));

-- Recorded-at is when it was typed in; expense_date is when it economically
-- belongs (e.g. July salary entered in August still reports under July).
ALTER TABLE outlet_expenses ADD COLUMN expense_date DATE NOT NULL DEFAULT CURRENT_DATE;
UPDATE outlet_expenses SET expense_date = recorded_at::date;

-- A till expense without a shift would be invisible to cash reconciliation,
-- which was the whole reason shift_id was NOT NULL. Keep that guarantee for
-- cash_drawer only.
ALTER TABLE outlet_expenses ADD CONSTRAINT outlet_expenses_shift_required
  CHECK (source <> 'cash_drawer' OR shift_id IS NOT NULL);

-- Broader category list so the P&L reads sensibly (sewa/utilitas used to be
-- lumped into 'operasional').
ALTER TABLE outlet_expenses DROP CONSTRAINT outlet_expenses_category_check;
ALTER TABLE outlet_expenses ADD CONSTRAINT outlet_expenses_category_check
  CHECK (category IN ('bahan_baku', 'gaji', 'sewa', 'utilitas', 'operasional', 'transport', 'lainnya'));

CREATE INDEX idx_outlet_expenses_date ON outlet_expenses(outlet_id, expense_date DESC);
