import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../rbac/require-permission.js';
import { resolveOutletId } from '../../utils/outlet-scope.js';

const tableInput = z.object({
  name: z.string().min(1),
  capacity: z.number().int().positive().default(4),
  sortOrder: z.number().int().default(0),
});

const openSessionInput = z.object({
  guestCount: z.number().int().positive().optional(),
  orderType: z.enum(['dine_in', 'takeaway', 'delivery']).default('dine_in'),
});

export default async function tablesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/tables', { preHandler: requirePermission('table.manage', 'order.create') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { rows } = await pool.query(
      `SELECT dt.id, dt.name, dt.capacity, dt.status, dt.sort_order,
              ts.id AS open_session_id
       FROM dining_tables dt
       LEFT JOIN table_sessions ts ON ts.table_id = dt.id AND ts.status = 'open'
       WHERE dt.outlet_id = $1 AND dt.is_active = true
       ORDER BY dt.sort_order, dt.name`,
      [outletId],
    );
    return reply.send({ tables: rows });
  });

  fastify.post('/tables', { preHandler: requirePermission('table.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const parsed = tableInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });

    const { rows } = await pool.query(
      `INSERT INTO dining_tables (outlet_id, name, capacity, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, capacity, status, sort_order`,
      [outletId, parsed.data.name, parsed.data.capacity, parsed.data.sortOrder],
    );
    return reply.code(201).send({ table: rows[0] });
  });

  // Open a new session on a table (marks it occupied). Returns 409 if a
  // session is already open on that table.
  fastify.post('/tables/:id/open-session', { preHandler: requirePermission('order.create') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const parsed = openSessionInput.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT id FROM table_sessions WHERE table_id = $1 AND status = 'open'`,
        [id],
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'session_already_open', sessionId: existing.rows[0].id });
      }

      const sessionRes = await client.query(
        `INSERT INTO table_sessions (outlet_id, table_id, order_type, guest_count, opened_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, table_id, order_type, status, guest_count, opened_at`,
        [outletId, id, parsed.data.orderType, parsed.data.guestCount ?? null, request.user.sub],
      );
      await client.query(`UPDATE dining_tables SET status = 'occupied' WHERE id = $1`, [id]);

      await client.query('COMMIT');
      return reply.code(201).send({ session: sessionRes.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // Close a session: only allowed once all its orders are completed or
  // cancelled (i.e. nothing left unpaid).
  fastify.post('/table-sessions/:id/close', { preHandler: requirePermission('order.close') }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const openOrders = await client.query(
        `SELECT id FROM orders WHERE table_session_id = $1 AND status = 'open'`,
        [id],
      );
      if (openOrders.rows.length > 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'open_orders_remaining', message: 'Masih ada order yang belum selesai/dibayar' });
      }

      const sessionRes = await client.query(
        `UPDATE table_sessions SET status = 'closed', closed_at = now()
         WHERE id = $1 AND status = 'open'
         RETURNING id, table_id`,
        [id],
      );
      if (sessionRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'not_found' });
      }

      const tableId = sessionRes.rows[0].table_id;
      if (tableId) {
        await client.query(`UPDATE dining_tables SET status = 'available' WHERE id = $1`, [tableId]);
      }

      await client.query('COMMIT');
      return reply.send({ closed: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
