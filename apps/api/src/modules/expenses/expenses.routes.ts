import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../rbac/require-permission.js';
import { resolveOutletId } from '../../utils/outlet-scope.js';
import { getOpenShiftId } from '../shifts/shifts.service.js';

const EXPENSE_CATEGORIES = ['bahan_baku', 'gaji', 'sewa', 'utilitas', 'operasional', 'transport', 'lainnya'] as const;

const createExpenseInput = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive(),
  notes: z.string().optional(),
  // 'cash_drawer' leaves the till during a shift; 'outlet' is a charge paid
  // elsewhere (bank/owner) that must not touch drawer reconciliation.
  source: z.enum(['cash_drawer', 'outlet']).default('cash_drawer'),
  expenseDate: z.string().optional(),
});

export default async function expensesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/expenses', { preHandler: requirePermission('expense.manage', 'report.view_business') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { from, to, source } = request.query as { from?: string; to?: string; source?: string };

    const { rows } = await pool.query(
      `SELECT e.id, e.category, e.amount, e.notes, e.source, e.expense_date, e.recorded_at,
              e.shift_id, u.full_name AS recorded_by_name
       FROM outlet_expenses e
       LEFT JOIN users u ON u.id = e.recorded_by
       WHERE e.outlet_id = $1
         AND ($2::date IS NULL OR e.expense_date >= $2::date)
         AND ($3::date IS NULL OR e.expense_date <= $3::date)
         AND ($4::text IS NULL OR e.source = $4)
       ORDER BY e.expense_date DESC, e.recorded_at DESC
       LIMIT 200`,
      [outletId, from ?? null, to ?? null, source ?? null],
    );
    return reply.send({ expenses: rows });
  });

  fastify.post('/expenses', { preHandler: requirePermission('expense.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const parsed = createExpenseInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    // Only till expenses need (and get attached to) an open shift.
    let shiftId: string | null = null;
    if (d.source === 'cash_drawer') {
      shiftId = await getOpenShiftId(pool, outletId);
      if (!shiftId) {
        return reply.code(409).send({ error: 'no_open_shift', message: 'Belum ada shift yang dibuka di outlet ini' });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO outlet_expenses (outlet_id, shift_id, category, amount, notes, source, expense_date, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE), $8)
       RETURNING id, category, amount, notes, source, expense_date, recorded_at`,
      [outletId, shiftId, d.category, d.amount, d.notes ?? null, d.source, d.expenseDate ?? null, request.user.sub],
    );
    return reply.code(201).send({ expense: rows[0] });
  });

  fastify.delete('/expenses/:id', { preHandler: requirePermission('expense.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };

    // A till expense already folded into a closed shift's reconciliation
    // can't be removed without invalidating that shift's variance.
    const { rows } = await pool.query(
      `SELECT e.source, s.status AS shift_status
       FROM outlet_expenses e LEFT JOIN shifts s ON s.id = e.shift_id
       WHERE e.id = $1 AND e.outlet_id = $2`,
      [id, outletId],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    if (rows[0].source === 'cash_drawer' && rows[0].shift_status === 'closed') {
      return reply.code(409).send({
        error: 'shift_closed',
        message: 'Pengeluaran ini sudah masuk rekonsiliasi shift yang tertutup dan tidak bisa dihapus',
      });
    }

    await pool.query(`DELETE FROM outlet_expenses WHERE id = $1 AND outlet_id = $2`, [id, outletId]);
    return reply.code(204).send();
  });
}
