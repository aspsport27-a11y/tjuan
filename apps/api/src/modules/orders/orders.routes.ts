import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../rbac/require-permission.js';
import { resolveOutletId } from '../../utils/outlet-scope.js';
import { nextOrderNumber, recalculateOrderTotals } from './orders.service.js';
import { deductStockForOrderItem, InsufficientStockError } from '../inventory/inventory.service.js';
import { getOpenShiftId } from '../shifts/shifts.service.js';

const orderItemInput = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().positive().default(1),
  notes: z.string().optional(),
  modifierIds: z.array(z.string().uuid()).default([]),
});

const createOrderInput = z.object({
  tableSessionId: z.string().uuid().optional(), // dormant: dine-in-table flow removed from POS, kept for historical data
  orderType: z.enum(['dine_in', 'takeaway', 'delivery']).default('dine_in'),
  customerLabel: z.string().optional(), // free text: "Meja A", a name, "GoFood #123" -- how a cashier finds an open bill again
  items: z.array(orderItemInput).min(1),
  notes: z.string().optional(),
});

async function insertOrderItem(
  client: import('pg').PoolClient,
  params: { orderId: string; outletId: string; userId: string; item: z.infer<typeof orderItemInput> },
) {
  const { orderId, outletId, userId, item } = params;

  const menuItemRes = await client.query(
    `SELECT name, price, track_stock, is_active FROM menu_items WHERE id = $1 AND outlet_id = $2`,
    [item.menuItemId, outletId],
  );
  if (menuItemRes.rows.length === 0) {
    throw Object.assign(new Error('Menu item not found'), { statusCode: 400, code: 'menu_item_not_found' });
  }
  const menuItem = menuItemRes.rows[0];
  if (!menuItem.is_active) {
    throw Object.assign(new Error('Menu item is inactive'), { statusCode: 400, code: 'menu_item_inactive' });
  }

  let modifiers: { id: string; name: string; price_delta: string }[] = [];
  if (item.modifierIds.length > 0) {
    const modRes = await client.query(
      `SELECT id, name, price_delta FROM modifiers WHERE id = ANY($1::uuid[])`,
      [item.modifierIds],
    );
    modifiers = modRes.rows;
  }

  const modifierTotal = modifiers.reduce((sum, m) => sum + Number(m.price_delta), 0);
  const unitPrice = Number(menuItem.price) + modifierTotal;
  const lineTotal = unitPrice * item.quantity;

  const orderItemRes = await client.query(
    `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, notes, line_total)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [orderId, item.menuItemId, menuItem.name, unitPrice, item.quantity, item.notes ?? null, lineTotal],
  );
  const orderItemId = orderItemRes.rows[0].id;

  for (const m of modifiers) {
    await client.query(
      `INSERT INTO order_item_modifiers (order_item_id, modifier_id, modifier_name_snapshot, price_delta_snapshot)
       VALUES ($1, $2, $3, $4)`,
      [orderItemId, m.id, m.name, m.price_delta],
    );
  }

  if (menuItem.track_stock) {
    await deductStockForOrderItem(client, {
      outletId,
      menuItemId: item.menuItemId,
      modifierIds: item.modifierIds,
      qty: item.quantity,
      orderItemId,
      userId,
    });
  }

  return orderItemId;
}

export default async function ordersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/orders', { preHandler: requirePermission('order.create', 'order.update', 'report.view_business') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { status, tableSessionId } = request.query as { status?: string; tableSessionId?: string };

    const { rows } = await pool.query(
      `SELECT id, order_number, table_session_id, order_type, customer_label, status,
              subtotal, discount_total, tax_total, service_charge_total, grand_total, created_at
       FROM orders
       WHERE outlet_id = $1
         AND ($2::text IS NULL OR status = $2)
         AND ($3::uuid IS NULL OR table_session_id = $3)
       ORDER BY created_at DESC
       LIMIT 100`,
      [outletId, status ?? null, tableSessionId ?? null],
    );
    return reply.send({ orders: rows });
  });

  fastify.get('/orders/:id', { preHandler: requirePermission('order.create', 'order.update', 'report.view_business') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };

    const orderRes = await pool.query(`SELECT * FROM orders WHERE id = $1 AND outlet_id = $2`, [id, outletId]);
    if (orderRes.rows.length === 0) return reply.code(404).send({ error: 'not_found' });

    const itemsRes = await pool.query(
      `SELECT oi.id, oi.menu_item_id, oi.item_name_snapshot, oi.unit_price_snapshot, oi.quantity,
              oi.notes, oi.status, oi.line_total,
              COALESCE(json_agg(json_build_object(
                'id', oim.id, 'modifierId', oim.modifier_id,
                'name', oim.modifier_name_snapshot, 'priceDelta', oim.price_delta_snapshot
              )) FILTER (WHERE oim.id IS NOT NULL), '[]') AS modifiers
       FROM order_items oi
       LEFT JOIN order_item_modifiers oim ON oim.order_item_id = oi.id
       WHERE oi.order_id = $1
       GROUP BY oi.id
       ORDER BY oi.created_at`,
      [id],
    );

    const paymentsRes = await pool.query(
      `SELECT id, method, amount, reference_no, paid_at FROM payments WHERE order_id = $1 ORDER BY paid_at`,
      [id],
    );

    return reply.send({ order: orderRes.rows[0], items: itemsRes.rows, payments: paymentsRes.rows });
  });

  fastify.post('/orders', { preHandler: requirePermission('order.create') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const parsed = createOrderInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const shiftId = await getOpenShiftId(client, outletId);
      if (!shiftId) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'no_open_shift', message: 'Belum ada shift yang dibuka di outlet ini' });
      }

      const orderNumber = await nextOrderNumber(client, outletId);
      const orderRes = await client.query(
        `INSERT INTO orders (outlet_id, table_session_id, order_type, customer_label, shift_id, order_number, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, order_number, order_type, customer_label, status, created_at`,
        [outletId, d.tableSessionId ?? null, d.orderType, d.customerLabel ?? null, shiftId, orderNumber, d.notes ?? null, request.user.sub],
      );
      const orderId = orderRes.rows[0].id;

      for (const item of d.items) {
        await insertOrderItem(client, { orderId, outletId, userId: request.user.sub, item });
      }

      const totals = await recalculateOrderTotals(client, orderId);

      await client.query('COMMIT');
      return reply.code(201).send({ order: { ...orderRes.rows[0], ...totals } });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof InsufficientStockError) {
        return reply.code(409).send({ error: 'insufficient_stock', shortages: err.shortages });
      }
      const anyErr = err as { statusCode?: number; code?: string; message?: string };
      if (anyErr.statusCode) {
        return reply.code(anyErr.statusCode).send({ error: anyErr.code, message: anyErr.message });
      }
      throw err;
    } finally {
      client.release();
    }
  });

  // Add one or more items to an existing open order (a new "round").
  fastify.post('/orders/:id/items', { preHandler: requirePermission('order.update') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const parsed = z.object({ items: z.array(orderItemInput).min(1) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(`SELECT status FROM orders WHERE id = $1 AND outlet_id = $2 FOR UPDATE`, [id, outletId]);
      if (orderRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'not_found' });
      }
      if (orderRes.rows[0].status !== 'open') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'order_not_open' });
      }

      for (const item of parsed.data.items) {
        await insertOrderItem(client, { orderId: id, outletId, userId: request.user.sub, item });
      }

      const totals = await recalculateOrderTotals(client, id);

      await client.query('COMMIT');
      return reply.send({ order: { id, ...totals } });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof InsufficientStockError) {
        return reply.code(409).send({ error: 'insufficient_stock', shortages: err.shortages });
      }
      throw err;
    } finally {
      client.release();
    }
  });

  // Cancel a single line item and restock whatever it had deducted.
  fastify.post('/order-items/:itemId/cancel', { preHandler: requirePermission('order.cancel') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { itemId } = request.params as { itemId: string };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const itemRes = await client.query(
        `SELECT oi.id, oi.order_id, oi.status, o.outlet_id
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.id = $1 AND o.outlet_id = $2 FOR UPDATE`,
        [itemId, outletId],
      );
      if (itemRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'not_found' });
      }
      if (itemRes.rows[0].status === 'cancelled') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'already_cancelled' });
      }

      // Reverse any sale_deduction inventory transactions tied to this item.
      const deductions = await client.query(
        `SELECT ingredient_id, quantity FROM inventory_transactions
         WHERE reference_type = 'order_item' AND reference_id = $1 AND type = 'sale_deduction'`,
        [itemId],
      );
      for (const d of deductions.rows) {
        const restoreQty = -Number(d.quantity); // quantity was stored negative
        await client.query(`UPDATE ingredients SET current_stock = current_stock + $2 WHERE id = $1`, [d.ingredient_id, restoreQty]);
        await client.query(
          `INSERT INTO inventory_transactions (outlet_id, ingredient_id, type, quantity, reference_type, reference_id, notes, created_by)
           VALUES ($1, $2, 'adjustment', $3, 'order_item_cancel', $4, 'Restock dari pembatalan item', $5)`,
          [itemRes.rows[0].outlet_id, d.ingredient_id, restoreQty, itemId, request.user.sub],
        );
      }

      await client.query(`UPDATE order_items SET status = 'cancelled' WHERE id = $1`, [itemId]);
      const totals = await recalculateOrderTotals(client, itemRes.rows[0].order_id);

      await client.query('COMMIT');
      return reply.send({ cancelled: true, order: { id: itemRes.rows[0].order_id, ...totals } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // Record a payment. When cumulative payments cover grand_total, the order
  // auto-completes (kept simple for MVP; partial/split payments accumulate).
  fastify.post('/orders/:id/payments', { preHandler: requirePermission('payment.create') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const parsed = z
      .object({
        method: z.enum(['cash', 'qris', 'card', 'transfer', 'gofood', 'grabfood']),
        amount: z.number().positive(),
        referenceNo: z.string().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(`SELECT grand_total, status, shift_id FROM orders WHERE id = $1 AND outlet_id = $2 FOR UPDATE`, [id, outletId]);
      if (orderRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'not_found' });
      }
      if (orderRes.rows[0].status !== 'open') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'order_not_open' });
      }

      await client.query(
        `INSERT INTO payments (order_id, outlet_id, shift_id, method, amount, reference_no, received_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, outletId, orderRes.rows[0].shift_id, d.method, d.amount, d.referenceNo ?? null, request.user.sub],
      );

      const paidRes = await client.query(`SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE order_id = $1`, [id]);
      const paid = Number(paidRes.rows[0].paid);
      const grandTotal = Number(orderRes.rows[0].grand_total);

      let status = 'open';
      if (paid >= grandTotal) {
        status = 'completed';
        await client.query(`UPDATE orders SET status = 'completed' WHERE id = $1`, [id]);
      }

      await client.query('COMMIT');
      return reply.code(201).send({ paid, grandTotal, remaining: Math.max(grandTotal - paid, 0), status });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  fastify.post('/orders/:id/cancel', { preHandler: requirePermission('order.cancel') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const ownedOrder = await client.query(`SELECT id FROM orders WHERE id = $1 AND outlet_id = $2`, [id, outletId]);
      if (ownedOrder.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'not_found' });
      }

      const items = await client.query(`SELECT id FROM order_items WHERE order_id = $1 AND status = 'active'`, [id]);
      for (const item of items.rows) {
        const deductions = await client.query(
          `SELECT ingredient_id, quantity FROM inventory_transactions
           WHERE reference_type = 'order_item' AND reference_id = $1 AND type = 'sale_deduction'`,
          [item.id],
        );
        for (const dtx of deductions.rows) {
          const restoreQty = -Number(dtx.quantity);
          await client.query(`UPDATE ingredients SET current_stock = current_stock + $2 WHERE id = $1`, [dtx.ingredient_id, restoreQty]);
        }
      }
      await client.query(`UPDATE order_items SET status = 'cancelled' WHERE order_id = $1 AND status = 'active'`, [id]);

      const res = await client.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status = 'open' RETURNING id`, [id]);
      if (res.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'order_not_open' });
      }

      await client.query('COMMIT');
      return reply.send({ cancelled: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
