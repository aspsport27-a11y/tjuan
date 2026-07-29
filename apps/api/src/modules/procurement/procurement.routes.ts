import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../rbac/require-permission.js';
import { resolveOutletId } from '../../utils/outlet-scope.js';
import { applyStockMovement } from '../inventory/inventory.service.js';
import { nextPoNumber } from './procurement.service.js';

const supplierInput = z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
});

const poItemInput = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
});

const createPoInput = z.object({
  supplierId: z.string().uuid(),
  orderDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(poItemInput).min(1, 'Minimal 1 item'),
});

export default async function procurementRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // --- Suppliers (global, not outlet-scoped) --------------------------------

  fastify.get('/suppliers', { preHandler: requirePermission('procurement.manage', 'inventory.view') }, async (_request, reply) => {
    const { rows } = await pool.query(
      `SELECT id, name, contact_person, phone, email, address, notes, is_active
       FROM suppliers ORDER BY name`,
    );
    return reply.send({ suppliers: rows });
  });

  fastify.post('/suppliers', { preHandler: requirePermission('procurement.manage') }, async (request, reply) => {
    const parsed = supplierInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    try {
      const { rows } = await pool.query(
        `INSERT INTO suppliers (name, contact_person, phone, email, address, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, contact_person, phone, email, address, notes, is_active`,
        [d.name, d.contactPerson ?? null, d.phone ?? null, d.email || null, d.address ?? null, d.notes ?? null],
      );
      return reply.code(201).send({ supplier: rows[0] });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'name_taken', message: 'Nama supplier sudah dipakai' });
      }
      throw err;
    }
  });

  fastify.put('/suppliers/:id', { preHandler: requirePermission('procurement.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = supplierInput.partial().extend({ isActive: z.boolean().optional() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    const { rows } = await pool.query(
      `UPDATE suppliers SET
         name = COALESCE($2, name),
         contact_person = COALESCE($3, contact_person),
         phone = COALESCE($4, phone),
         email = COALESCE($5, email),
         address = COALESCE($6, address),
         notes = COALESCE($7, notes),
         is_active = COALESCE($8, is_active)
       WHERE id = $1
       RETURNING id, name, contact_person, phone, email, address, notes, is_active`,
      [id, d.name ?? null, d.contactPerson ?? null, d.phone ?? null, d.email || null, d.address ?? null, d.notes ?? null, d.isActive ?? null],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ supplier: rows[0] });
  });

  // --- Purchase orders (outlet-scoped) --------------------------------------

  fastify.get('/purchase-orders', { preHandler: requirePermission('procurement.manage', 'inventory.view') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { status } = request.query as { status?: string };

    const { rows } = await pool.query(
      `SELECT po.id, po.po_number, po.status, po.order_date, po.total_amount, po.notes,
              po.created_at, po.received_at, s.name AS supplier_name
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       WHERE po.outlet_id = $1 AND ($2::text IS NULL OR po.status = $2)
       ORDER BY po.created_at DESC
       LIMIT 100`,
      [outletId, status ?? null],
    );
    return reply.send({ purchaseOrders: rows });
  });

  fastify.get('/purchase-orders/:id', { preHandler: requirePermission('procurement.manage', 'inventory.view') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };

    const poRes = await pool.query(
      `SELECT po.*, s.name AS supplier_name
       FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
       WHERE po.id = $1 AND po.outlet_id = $2`,
      [id, outletId],
    );
    if (poRes.rows.length === 0) return reply.code(404).send({ error: 'not_found' });

    const itemsRes = await pool.query(
      `SELECT poi.id, poi.ingredient_id, i.name AS ingredient_name, i.unit,
              poi.quantity, poi.unit_cost, poi.subtotal
       FROM purchase_order_items poi
       JOIN ingredients i ON i.id = poi.ingredient_id
       WHERE poi.purchase_order_id = $1
       ORDER BY i.name`,
      [id],
    );

    return reply.send({ purchaseOrder: poRes.rows[0], items: itemsRes.rows });
  });

  fastify.post('/purchase-orders', { preHandler: requirePermission('procurement.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const parsed = createPoInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Every ingredient must belong to this outlet -- a PO for outlet A must
      // not be able to stock outlet B's ingredients.
      const ingredientIds = d.items.map((i) => i.ingredientId);
      const owned = await client.query(
        `SELECT id FROM ingredients WHERE id = ANY($1::uuid[]) AND outlet_id = $2`,
        [ingredientIds, outletId],
      );
      if (owned.rows.length !== new Set(ingredientIds).size) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'invalid_ingredient', message: 'Ada bahan yang tidak terdaftar di outlet ini' });
      }

      const poNumber = await nextPoNumber(client, outletId);
      const totalAmount = d.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);

      const poRes = await client.query(
        `INSERT INTO purchase_orders (outlet_id, supplier_id, po_number, order_date, total_amount, notes, created_by)
         VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6, $7)
         RETURNING id, po_number, status, order_date, total_amount`,
        [outletId, d.supplierId, poNumber, d.orderDate ?? null, totalAmount, d.notes ?? null, request.user.sub],
      );
      const poId = poRes.rows[0].id;

      for (const item of d.items) {
        await client.query(
          `INSERT INTO purchase_order_items (purchase_order_id, ingredient_id, quantity, unit_cost, subtotal)
           VALUES ($1, $2, $3, $4, $5)`,
          [poId, item.ingredientId, item.quantity, item.unitCost, item.quantity * item.unitCost],
        );
      }

      await client.query('COMMIT');
      return reply.code(201).send({ purchaseOrder: poRes.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // Receiving is what actually moves stock: each line adds to the ingredient
  // and refreshes its cost_per_unit (for HPP) via the shared movement helper.
  fastify.post('/purchase-orders/:id/receive', { preHandler: requirePermission('procurement.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const poRes = await client.query(
        `SELECT id, status FROM purchase_orders WHERE id = $1 AND outlet_id = $2 FOR UPDATE`,
        [id, outletId],
      );
      if (poRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'not_found' });
      }
      if (poRes.rows[0].status !== 'open') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'po_not_open', message: 'PO ini sudah diterima atau dibatalkan' });
      }

      const itemsRes = await client.query(
        `SELECT ingredient_id, quantity, unit_cost FROM purchase_order_items WHERE purchase_order_id = $1`,
        [id],
      );
      for (const item of itemsRes.rows) {
        await applyStockMovement(client, {
          outletId,
          ingredientId: item.ingredient_id,
          type: 'purchase',
          quantity: Number(item.quantity),
          unitCost: Number(item.unit_cost),
          referenceType: 'purchase_order',
          referenceId: id,
          userId: request.user.sub,
        });
      }

      const updated = await client.query(
        `UPDATE purchase_orders SET status = 'received', received_by = $2, received_at = now()
         WHERE id = $1 RETURNING id, po_number, status, received_at`,
        [id, request.user.sub],
      );

      await client.query('COMMIT');
      return reply.send({ purchaseOrder: updated.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  fastify.post('/purchase-orders/:id/cancel', { preHandler: requirePermission('procurement.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };

    const { rows } = await pool.query(
      `UPDATE purchase_orders SET status = 'cancelled'
       WHERE id = $1 AND outlet_id = $2 AND status = 'open'
       RETURNING id, status`,
      [id, outletId],
    );
    if (rows.length === 0) {
      return reply.code(409).send({ error: 'po_not_open', message: 'PO tidak ditemukan atau sudah diterima' });
    }
    return reply.send({ purchaseOrder: rows[0] });
  });
}
