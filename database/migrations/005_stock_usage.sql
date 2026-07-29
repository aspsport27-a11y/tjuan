-- =========================================================================
-- Phase D: manual stock usage. Recipe-based deduction on sale ('sale_deduction')
-- already covers what's sold; 'usage' covers everything else that consumes
-- stock without a sale -- kitchen prep, staff meals, transfers out, etc.
-- (Constraint name verified against pg_constraint on production first --
-- it was auto-named in 001_init.sql, so it must not be guessed.)
-- =========================================================================

ALTER TABLE inventory_transactions DROP CONSTRAINT inventory_transactions_type_check;
ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_type_check
  CHECK (type IN ('purchase', 'sale_deduction', 'adjustment', 'waste', 'usage'));

-- The ledger view filters by ingredient over a date range; the existing
-- indexes don't cover that access pattern.
CREATE INDEX idx_inventory_transactions_ingredient_created
  ON inventory_transactions(ingredient_id, created_at DESC);
