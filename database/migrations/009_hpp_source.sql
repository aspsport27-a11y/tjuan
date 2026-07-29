-- =========================================================================
-- HPP source per menu item. Until now HPP only ever came from the recipe
-- (BOM), so an item nobody bothered to build a recipe for (typically
-- resold-as-is items like bottled water -- bought and sold, nothing
-- prepared) silently reported HPP = 0, overstating its margin in every
-- report. Menu items now declare where their cost comes from:
--   'recipe'         -- sum(recipe_items.quantity * ingredient.cost_per_unit),
--                        the existing behaviour.
--   'purchase_price' -- a cost entered directly on the menu item, for
--                        resale items where building a recipe is overkill.
-- =========================================================================

ALTER TABLE menu_items ADD COLUMN hpp_source TEXT NOT NULL DEFAULT 'recipe'
  CHECK (hpp_source IN ('recipe', 'purchase_price'));
ALTER TABLE menu_items ADD COLUMN purchase_cost NUMERIC(14,4);

-- Picking purchase_price mode without a cost would just recreate the same
-- HPP=0 problem this migration exists to fix.
ALTER TABLE menu_items ADD CONSTRAINT menu_items_purchase_cost_required
  CHECK (hpp_source <> 'purchase_price' OR purchase_cost IS NOT NULL);
