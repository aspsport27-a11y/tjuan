import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../rbac/require-permission.js';
import { resolveOutletId } from '../../utils/outlet-scope.js';
import { getOpenShiftId } from '../shifts/shifts.service.js';

const EXPENSE_CATEGORIES = ['bahan_baku', 'operasional', 'gaji', 'transport', 'lainnya'] as const;

const createExpenseInput = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive(),
  notes: z.string().optional(),
});

export default async function expensesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/expenses', { preHandler: requirePermission('expense.manage', 'report.view_business') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { from, to } = request.query as { from?: string; to?: string };

    const { rows } = await pool.query(
      `SELECT e.id, e.category, e.amount, e.notes, e.recorded_at, e.shift_id, u.full_name AS recorded_by_name
       FROM outlet_expenses e
       LEFT JOIN users u ON u.id = e.recorded_by
       WHERE e.outlet_id = $1
         AND ($2::date IS NULL OR e.recorded_at >= $2::date)
         AND ($3::date IS NULL OR e.recorded_at < $3::date + interval '1 day')
       ORDER BY e.recorded_at DESC
       LIMIT 200`,
      [outletId, from ?? null, to ?? null],
    );
    return reply.send({ expenses: rows });
  });

  fastify.post('/expenses', { preHandler: requirePermission('expense.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const parsed = createExpenseInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    const shiftId = await getOpenShiftId(pool, outletId);
    if (!shiftId) {
      return reply.code(409).send({ error: 'no_open_shift', message: 'Belum ada shift yang dibuka di outlet ini' });
    }

    const { rows } = await pool.query(
      `INSERT INTO outlet_expenses (outlet_id, shift_id, category, amount, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, category, amount, notes, recorded_at`,
      [outletId, shiftId, d.category, d.amount, d.notes ?? null, request.user.sub],
    );
    return reply.code(201).send({ expense: rows[0] });
  });
}
