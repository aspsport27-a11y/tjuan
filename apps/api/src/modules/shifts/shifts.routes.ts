import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../rbac/require-permission.js';
import { resolveOutletId } from '../../utils/outlet-scope.js';
import { computeExpectedCash, nextShiftNumber } from './shifts.service.js';

const openShiftInput = z.object({ openingCash: z.number().nonnegative() });
const closeShiftInput = z.object({ closingCashCounted: z.number().nonnegative(), notes: z.string().optional() });

export default async function shiftsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/shifts/current', { preHandler: requirePermission('shift.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { rows } = await pool.query(`SELECT * FROM shifts WHERE outlet_id = $1 AND status = 'open'`, [outletId]);
    if (rows.length === 0) return reply.send({ shift: null });
    const shift = rows[0];
    const runningExpectedCash = await computeExpectedCash(pool, shift.id, Number(shift.opening_cash));
    return reply.send({ shift: { ...shift, runningExpectedCash } });
  });

  fastify.get('/shifts', { preHandler: requirePermission('shift.manage', 'report.view_business') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { rows } = await pool.query(
      `SELECT * FROM shifts WHERE outlet_id = $1 ORDER BY opened_at DESC LIMIT 50`,
      [outletId],
    );
    return reply.send({ shifts: rows });
  });

  fastify.get('/shifts/:id', { preHandler: requirePermission('shift.manage', 'report.view_business') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };

    const shiftRes = await pool.query(`SELECT * FROM shifts WHERE id = $1 AND outlet_id = $2`, [id, outletId]);
    if (shiftRes.rows.length === 0) return reply.code(404).send({ error: 'not_found' });

    const salesRes = await pool.query(
      `SELECT method, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM payments WHERE shift_id = $1 GROUP BY method ORDER BY method`,
      [id],
    );
    const expensesRes = await pool.query(
      `SELECT id, category, amount, notes, recorded_at FROM outlet_expenses WHERE shift_id = $1 ORDER BY recorded_at`,
      [id],
    );

    return reply.send({ shift: shiftRes.rows[0], salesByMethod: salesRes.rows, expenses: expensesRes.rows });
  });

  fastify.post('/shifts/open', { preHandler: requirePermission('shift.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const parsed = openShiftInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const shiftNumber = await nextShiftNumber(client, outletId);
      const { rows } = await client.query(
        `INSERT INTO shifts (outlet_id, shift_number, opening_cash, opened_by)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [outletId, shiftNumber, parsed.data.openingCash, request.user.sub],
      );
      await client.query('COMMIT');
      return reply.code(201).send({ shift: rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        return reply.code(409).send({ error: 'shift_already_open', message: 'Sudah ada shift yang terbuka di outlet ini' });
      }
      throw err;
    } finally {
      client.release();
    }
  });

  fastify.post('/shifts/:id/close', { preHandler: requirePermission('shift.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const parsed = closeShiftInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const shiftRes = await client.query(
        `SELECT * FROM shifts WHERE id = $1 AND outlet_id = $2 AND status = 'open' FOR UPDATE`,
        [id, outletId],
      );
      if (shiftRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'not_found' });
      }
      const shift = shiftRes.rows[0];

      const openOrders = await client.query(
        `SELECT id FROM orders WHERE outlet_id = $1 AND shift_id = $2 AND status = 'open'`,
        [outletId, id],
      );
      if (openOrders.rows.length > 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          error: 'open_bills_remaining',
          message: 'Masih ada bill terbuka yang belum dibayar/dibatalkan',
          count: openOrders.rows.length,
        });
      }

      const expectedCash = await computeExpectedCash(client, id, Number(shift.opening_cash));
      const variance = parsed.data.closingCashCounted - expectedCash;

      const { rows } = await client.query(
        `UPDATE shifts SET
           status = 'closed',
           closing_cash_counted = $2,
           expected_cash = $3,
           cash_variance = $4,
           closed_by = $5,
           closed_at = now(),
           notes = $6
         WHERE id = $1
         RETURNING *`,
        [id, parsed.data.closingCashCounted, expectedCash, variance, request.user.sub, parsed.data.notes ?? null],
      );

      await client.query('COMMIT');
      return reply.send({ shift: rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
