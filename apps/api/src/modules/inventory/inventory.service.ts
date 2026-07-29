import type { PoolClient } from 'pg';

export class InsufficientStockError extends Error {
  constructor(public shortages: { ingredientId: string; name: string; required: number; available: number; unit: string }[]) {
    super('Stok bahan tidak cukup');
    this.name = 'InsufficientStockError';
  }
}

interface RequiredIngredient {
  ingredientId: string;
  name: string;
  unit: string;
  currentStock: number;
  quantity: number; // total required for this order item (already multiplied by order qty)
}

/**
 * Compute total ingredient requirements for one order item (menu item +
 * its selected modifiers), scaled by quantity ordered.
 */
async function computeRequirements(
  client: PoolClient,
  menuItemId: string,
  modifierIds: string[],
  qty: number,
): Promise<RequiredIngredient[]> {
  const needed = new Map<string, RequiredIngredient>();

  const { rows: itemRows } = await client.query(
    `SELECT ri.ingredient_id, ri.quantity, i.name, i.unit, i.current_stock
     FROM recipe_items ri
     JOIN ingredients i ON i.id = ri.ingredient_id
     WHERE ri.menu_item_id = $1`,
    [menuItemId],
  );
  for (const r of itemRows) {
    const existing = needed.get(r.ingredient_id);
    const add = Number(r.quantity) * qty;
    if (existing) existing.quantity += add;
    else
      needed.set(r.ingredient_id, {
        ingredientId: r.ingredient_id,
        name: r.name,
        unit: r.unit,
        currentStock: Number(r.current_stock),
        quantity: add,
      });
  }

  if (modifierIds.length > 0) {
    const { rows: modRows } = await client.query(
      `SELECT mri.ingredient_id, mri.quantity, i.name, i.unit, i.current_stock
       FROM modifier_recipe_items mri
       JOIN ingredients i ON i.id = mri.ingredient_id
       WHERE mri.modifier_id = ANY($1::uuid[])`,
      [modifierIds],
    );
    for (const r of modRows) {
      const existing = needed.get(r.ingredient_id);
      const add = Number(r.quantity) * qty;
      if (existing) existing.quantity += add;
      else
        needed.set(r.ingredient_id, {
          ingredientId: r.ingredient_id,
          name: r.name,
          unit: r.unit,
          currentStock: Number(r.current_stock),
          quantity: add,
        });
    }
  }

  return Array.from(needed.values());
}

/**
 * Deduct ingredient stock for a sold order item and record the movement.
 * Must be called inside the same transaction as the order/order_item insert
 * so a failure rolls back the whole sale. Throws InsufficientStockError
 * (without mutating anything) if any ingredient would go negative.
 */
export async function deductStockForOrderItem(
  client: PoolClient,
  params: {
    outletId: string;
    menuItemId: string;
    modifierIds: string[];
    qty: number;
    orderItemId: string;
    userId: string | null;
  },
): Promise<void> {
  const requirements = await computeRequirements(client, params.menuItemId, params.modifierIds, params.qty);
  if (requirements.length === 0) return; // no recipe defined -> nothing to deduct

  const shortages = requirements.filter((r) => r.currentStock - r.quantity < 0);
  if (shortages.length > 0) {
    throw new InsufficientStockError(
      shortages.map((s) => ({
        ingredientId: s.ingredientId,
        name: s.name,
        required: s.quantity,
        available: s.currentStock,
        unit: s.unit,
      })),
    );
  }

  for (const req of requirements) {
    await client.query(
      `UPDATE ingredients SET current_stock = current_stock - $2 WHERE id = $1`,
      [req.ingredientId, req.quantity],
    );
    await client.query(
      `INSERT INTO inventory_transactions
         (outlet_id, ingredient_id, type, quantity, reference_type, reference_id, created_by)
       VALUES ($1, $2, 'sale_deduction', $3, 'order_item', $4, $5)`,
      [params.outletId, req.ingredientId, -req.quantity, params.orderItemId, params.userId],
    );
  }
}
