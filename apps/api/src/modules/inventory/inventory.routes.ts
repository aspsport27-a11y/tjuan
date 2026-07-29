import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../rbac/require-permission.js';
import { resolveOutletId } from '../../utils/outlet-scope.js';
import { applyStockMovement } from './inventory.service.js';

const ingredientInput = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  minStock: z.number().nonnegative().default(0),
  costPerUnit: z.number().nonnegative().default(0),
});

const adjustmentInput = z.object({
  quantity: z.number().refine((v) => v !== 0, 'quantity tidak boleh 0'), // positive = stock in, negative = stock out
  type: z.enum(['purchase', 'adjustment', 'waste', 'usage']),
  unitCost: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const recipeItemInput = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.number().positive(),
});

export default async function inventoryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // --- Ingredients -----------------------------------------------------------

  fastify.get('/ingredients', { preHandler: requirePermission('inventory.view') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { rows } = await pool.query(
      `SELECT id, name, unit, current_stock, min_stock, cost_per_unit, is_active
       FROM ingredients WHERE outlet_id = $1 ORDER BY name`,
      [outletId],
    );
    return reply.send({ ingredients: rows });
  });

  fastify.post('/ingredients', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const parsed = ingredientInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    const { rows } = await pool.query(
      `INSERT INTO ingredients (outlet_id, name, unit, min_stock, cost_per_unit)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, unit, current_stock, min_stock, cost_per_unit, is_active`,
      [outletId, d.name, d.unit, d.minStock, d.costPerUnit],
    );
    return reply.code(201).send({ ingredient: rows[0] });
  });

  // Manual stock movement: purchases, adjustments, waste. Sale-driven
  // deductions happen automatically in orders.routes.ts and never go
  // through this endpoint.
  fastify.post('/ingredients/:id/adjust', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const parsed = adjustmentInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const current = await client.query(`SELECT current_stock FROM ingredients WHERE id = $1 AND outlet_id = $2 FOR UPDATE`, [id, outletId]);
      if (current.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'not_found' });
      }
      const newStock = Number(current.rows[0].current_stock) + d.quantity;
      if (newStock < 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'insufficient_stock', message: 'Penyesuaian akan membuat stok negatif' });
      }

      await applyStockMovement(client, {
        outletId,
        ingredientId: id,
        type: d.type,
        quantity: d.quantity,
        unitCost: d.unitCost ?? null,
        referenceType: 'manual',
        notes: d.notes ?? null,
        userId: request.user.sub,
      });

      await client.query('COMMIT');
      return reply.send({ currentStock: newStock });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // Stock ledger for one ingredient: every movement in/out with its source,
  // so a discrepancy can be traced back to a sale, a purchase, or a manual entry.
  fastify.get('/ingredients/:id/history', { preHandler: requirePermission('inventory.view') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };

    const owned = await pool.query(`SELECT id, name, unit, current_stock FROM ingredients WHERE id = $1 AND outlet_id = $2`, [id, outletId]);
    if (owned.rows.length === 0) return reply.code(404).send({ error: 'not_found' });

    const { rows } = await pool.query(
      `SELECT it.id, it.type, it.quantity, it.unit_cost, it.reference_type, it.reference_id,
              it.notes, it.created_at, u.full_name AS created_by_name
       FROM inventory_transactions it
       LEFT JOIN users u ON u.id = it.created_by
       WHERE it.ingredient_id = $1
         AND ($2::date IS NULL OR it.created_at >= $2::date)
         AND ($3::date IS NULL OR it.created_at < $3::date + interval '1 day')
       ORDER BY it.created_at DESC
       LIMIT 200`,
      [id, from ?? null, to ?? null],
    );

    return reply.send({ ingredient: owned.rows[0], movements: rows });
  });

  // --- Recipes (BOM) ---------------------------------------------------------

  fastify.get('/menu-items/:id/recipe', { preHandler: requirePermission('inventory.view', 'menu.view') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const { rows } = await pool.query(
      `SELECT ri.id, ri.ingredient_id, i.name, i.unit, ri.quantity
       FROM recipe_items ri
       JOIN ingredients i ON i.id = ri.ingredient_id
       JOIN menu_items mi ON mi.id = ri.menu_item_id
       WHERE ri.menu_item_id = $1 AND mi.outlet_id = $2
       ORDER BY i.name`,
      [id, outletId],
    );
    return reply.send({ recipe: rows });
  });

  fastify.put('/menu-items/:id/recipe', { preHandler: requirePermission('inventory.manage', 'menu.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const parsed = z.array(recipeItemInput).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const menuItemCheck = await client.query(`SELECT id FROM menu_items WHERE id = $1 AND outlet_id = $2`, [id, outletId]);
      if (menuItemCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'not_found' });
      }

      // Every ingredient referenced must belong to the same outlet as the menu item.
      const ingredientIds = parsed.data.map((item) => item.ingredientId);
      if (ingredientIds.length > 0) {
        const ownedCheck = await client.query(
          `SELECT id FROM ingredients WHERE id = ANY($1::uuid[]) AND outlet_id = $2`,
          [ingredientIds, outletId],
        );
        if (ownedCheck.rows.length !== new Set(ingredientIds).size) {
          await client.query('ROLLBACK');
          return reply.code(400).send({ error: 'invalid_ingredient', message: 'Salah satu bahan tidak ditemukan di outlet ini' });
        }
      }

      await client.query(`DELETE FROM recipe_items WHERE menu_item_id = $1`, [id]);
      for (const item of parsed.data) {
        await client.query(
          `INSERT INTO recipe_items (menu_item_id, ingredient_id, quantity) VALUES ($1, $2, $3)`,
          [id, item.ingredientId, item.quantity],
        );
      }
      await client.query('COMMIT');
      return reply.send({ saved: true, count: parsed.data.length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // HPP helper: cost of one unit of a menu item based on its current recipe
  // and ingredient cost_per_unit.
  fastify.get('/menu-items/:id/cost', { preHandler: requirePermission('report.view_management') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const { rows } = await pool.query(
      `SELECT CASE
                WHEN mi.hpp_source = 'purchase_price' THEN COALESCE(mi.purchase_cost, 0)
                ELSE COALESCE((SELECT SUM(ri.quantity * i.cost_per_unit)
                                FROM recipe_items ri JOIN ingredients i ON i.id = ri.ingredient_id
                                WHERE ri.menu_item_id = mi.id), 0)
              END AS cost
       FROM menu_items mi
       WHERE mi.id = $1 AND mi.outlet_id = $2`,
      [id, outletId],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ menuItemId: id, estimatedCost: Number(rows[0].cost) });
  });
}
