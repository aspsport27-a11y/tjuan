import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../rbac/require-permission.js';
import { resolveOutletId } from '../../utils/outlet-scope.js';
import { assertAccountUsable, listAccountsWithBalance, postLedger } from './treasury.service.js';

const accountInput = z.object({
  name: z.string().min(1),
  type: z.enum(['cash', 'bank', 'ewallet']),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  openingBalance: z.number().default(0),
  // Central accounts (usable by every outlet) are created by leaving this
  // false; otherwise the account belongs to the active outlet.
  isCentral: z.boolean().default(false),
});

const transferInput = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: z.number().positive(),
  txDate: z.string().optional(),
  notes: z.string().optional(),
});

const depositInput = z.object({
  toAccountId: z.string().uuid(),
  shiftId: z.string().uuid().optional(),
  amount: z.number().positive(),
  depositDate: z.string().optional(),
  notes: z.string().optional(),
});

const settlementInput = z.object({
  method: z.enum(['qris', 'card', 'transfer', 'gofood', 'grabfood']),
  periodFrom: z.string(),
  periodTo: z.string(),
  actualAmount: z.number().nonnegative(),
  toAccountId: z.string().uuid(),
  notes: z.string().optional(),
});

export default async function treasuryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // --- Accounts -------------------------------------------------------------

  fastify.get('/accounts', { preHandler: requirePermission('treasury.view', 'treasury.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    return reply.send({ accounts: await listAccountsWithBalance(outletId) });
  });

  fastify.post('/accounts', { preHandler: requirePermission('treasury.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const parsed = accountInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    const { rows } = await pool.query(
      `INSERT INTO accounts (outlet_id, name, type, bank_name, account_number, opening_balance)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, outlet_id, name, type, bank_name, account_number, opening_balance, is_active`,
      [d.isCentral ? null : outletId, d.name, d.type, d.bankName ?? null, d.accountNumber ?? null, d.openingBalance],
    );
    return reply.code(201).send({ account: rows[0] });
  });

  fastify.put('/accounts/:id', { preHandler: requirePermission('treasury.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const parsed = accountInput.partial().extend({ isActive: z.boolean().optional() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    if (!(await assertAccountUsable(pool, id, outletId))) return reply.code(404).send({ error: 'not_found' });

    const { rows } = await pool.query(
      `UPDATE accounts SET
         name = COALESCE($2, name),
         bank_name = COALESCE($3, bank_name),
         account_number = COALESCE($4, account_number),
         is_active = COALESCE($5, is_active)
       WHERE id = $1
       RETURNING id, outlet_id, name, type, bank_name, account_number, opening_balance, is_active`,
      [id, d.name ?? null, d.bankName ?? null, d.accountNumber ?? null, d.isActive ?? null],
    );
    return reply.send({ account: rows[0] });
  });

  // --- Ledger ---------------------------------------------------------------

  fastify.get('/accounts/:id/ledger', { preHandler: requirePermission('treasury.view', 'treasury.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };

    if (!(await assertAccountUsable(pool, id, outletId))) return reply.code(404).send({ error: 'not_found' });

    const { rows } = await pool.query(
      `SELECT t.id, t.direction, t.amount, t.kind, t.reference_type, t.reference_id,
              t.tx_date, t.notes, t.created_at, u.full_name AS created_by_name
       FROM account_transactions t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.account_id = $1
         AND ($2::date IS NULL OR t.tx_date >= $2::date)
         AND ($3::date IS NULL OR t.tx_date <= $3::date)
       ORDER BY t.tx_date DESC, t.created_at DESC
       LIMIT 300`,
      [id, from ?? null, to ?? null],
    );
    return reply.send({ movements: rows });
  });

  fastify.post('/accounts/transfer', { preHandler: requirePermission('treasury.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const parsed = transferInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    if (d.fromAccountId === d.toAccountId) {
      return reply.code(400).send({ error: 'same_account', message: 'Rekening asal dan tujuan tidak boleh sama' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const accId of [d.fromAccountId, d.toAccountId]) {
        if (!(await assertAccountUsable(client, accId, outletId))) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'account_not_found' });
        }
      }

      const note = d.notes ?? 'Transfer antar rekening';
      await postLedger(client, {
        accountId: d.fromAccountId, direction: 'out', amount: d.amount, kind: 'transfer_out',
        referenceType: 'transfer', referenceId: d.toAccountId, txDate: d.txDate ?? null, notes: note, userId: request.user.sub,
      });
      await postLedger(client, {
        accountId: d.toAccountId, direction: 'in', amount: d.amount, kind: 'transfer_in',
        referenceType: 'transfer', referenceId: d.fromAccountId, txDate: d.txDate ?? null, notes: note, userId: request.user.sub,
      });

      await client.query('COMMIT');
      return reply.code(201).send({ transferred: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // --- Cash deposits --------------------------------------------------------

  // Shifts whose drawer cash hasn't been banked yet -- the work queue for
  // whoever does the daily deposit.
  fastify.get('/cash-deposits/pending', { preHandler: requirePermission('treasury.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { rows } = await pool.query(
      `SELECT s.id, s.shift_number, s.closed_at, s.closing_cash_counted, s.expected_cash, s.cash_variance
       FROM shifts s
       LEFT JOIN cash_deposits d ON d.shift_id = s.id
       WHERE s.outlet_id = $1 AND s.status = 'closed' AND d.id IS NULL
       ORDER BY s.closed_at DESC
       LIMIT 50`,
      [outletId],
    );
    return reply.send({ shifts: rows });
  });

  fastify.get('/cash-deposits', { preHandler: requirePermission('treasury.view', 'treasury.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { rows } = await pool.query(
      `SELECT d.id, d.amount, d.deposit_date, d.notes, d.shift_id,
              a.name AS account_name, s.shift_number, u.full_name AS created_by_name
       FROM cash_deposits d
       JOIN accounts a ON a.id = d.to_account_id
       LEFT JOIN shifts s ON s.id = d.shift_id
       LEFT JOIN users u ON u.id = d.created_by
       WHERE d.outlet_id = $1
       ORDER BY d.deposit_date DESC, d.created_at DESC
       LIMIT 100`,
      [outletId],
    );
    return reply.send({ deposits: rows });
  });

  fastify.post('/cash-deposits', { preHandler: requirePermission('treasury.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const parsed = depositInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await assertAccountUsable(client, d.toAccountId, outletId))) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'account_not_found' });
      }

      const { rows } = await client.query(
        `INSERT INTO cash_deposits (outlet_id, to_account_id, shift_id, amount, deposit_date, notes, created_by)
         VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6, $7)
         RETURNING id, amount, deposit_date`,
        [outletId, d.toAccountId, d.shiftId ?? null, d.amount, d.depositDate ?? null, d.notes ?? null, request.user.sub],
      );

      await postLedger(client, {
        accountId: d.toAccountId, direction: 'in', amount: d.amount, kind: 'cash_deposit',
        referenceType: 'cash_deposit', referenceId: rows[0].id, txDate: d.depositDate ?? null,
        notes: d.notes ?? 'Setoran kas', userId: request.user.sub,
      });

      await client.query('COMMIT');
      return reply.code(201).send({ deposit: rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        return reply.code(409).send({ error: 'shift_already_deposited', message: 'Kas shift ini sudah pernah disetor' });
      }
      throw err;
    } finally {
      client.release();
    }
  });

  // --- Settlements (non-cash reconciliation) --------------------------------

  // What the POS says should arrive, per method, so it can be compared with
  // the bank/platform statement before recording the actual figure.
  fastify.get('/settlements/expected', { preHandler: requirePermission('treasury.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { from, to } = request.query as { from?: string; to?: string };
    if (!from || !to) return reply.code(400).send({ error: 'invalid_request', message: 'from & to wajib diisi' });

    const { rows } = await pool.query(
      `SELECT p.method,
              COALESCE(SUM(p.amount), 0) AS system_amount,
              COUNT(*)                   AS payment_count,
              COALESCE((
                SELECT SUM(s.system_amount) FROM settlements s
                WHERE s.outlet_id = $1 AND s.method = p.method
                  AND s.period_from <= $3::date AND s.period_to >= $2::date
              ), 0) AS already_settled
       FROM payments p
       WHERE p.outlet_id = $1 AND p.method <> 'cash'
         AND p.paid_at >= $2::date AND p.paid_at < $3::date + interval '1 day'
       GROUP BY p.method
       ORDER BY p.method`,
      [outletId, from, to],
    );
    return reply.send({ from, to, methods: rows });
  });

  fastify.get('/settlements', { preHandler: requirePermission('treasury.view', 'treasury.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { rows } = await pool.query(
      `SELECT s.id, s.method, s.period_from, s.period_to, s.system_amount, s.actual_amount,
              s.fee_amount, s.notes, s.created_at, a.name AS account_name, u.full_name AS created_by_name
       FROM settlements s
       JOIN accounts a ON a.id = s.to_account_id
       LEFT JOIN users u ON u.id = s.created_by
       WHERE s.outlet_id = $1
       ORDER BY s.period_to DESC, s.created_at DESC
       LIMIT 100`,
      [outletId],
    );
    return reply.send({ settlements: rows });
  });

  fastify.post('/settlements', { preHandler: requirePermission('treasury.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const parsed = settlementInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await assertAccountUsable(client, d.toAccountId, outletId))) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'account_not_found' });
      }

      // System figure is recomputed server-side, never taken from the client,
      // so a settlement can't be booked against an invented sales number.
      const sysRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
         WHERE outlet_id = $1 AND method = $2
           AND paid_at >= $3::date AND paid_at < $4::date + interval '1 day'`,
        [outletId, d.method, d.periodFrom, d.periodTo],
      );
      const systemAmount = Number(sysRes.rows[0].total);
      const fee = systemAmount - d.actualAmount;

      const { rows } = await client.query(
        `INSERT INTO settlements
           (outlet_id, method, period_from, period_to, system_amount, actual_amount, fee_amount, to_account_id, notes, created_by)
         VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $10)
         RETURNING id, method, period_from, period_to, system_amount, actual_amount, fee_amount`,
        [outletId, d.method, d.periodFrom, d.periodTo, systemAmount, d.actualAmount, fee, d.toAccountId, d.notes ?? null, request.user.sub],
      );

      // Only the money that actually landed hits the ledger; the fee is the
      // difference and is reported, not banked.
      if (d.actualAmount > 0) {
        await postLedger(client, {
          accountId: d.toAccountId, direction: 'in', amount: d.actualAmount, kind: 'settlement',
          referenceType: 'settlement', referenceId: rows[0].id, txDate: d.periodTo,
          notes: `Settlement ${d.method} ${d.periodFrom} s/d ${d.periodTo}`, userId: request.user.sub,
        });
      }

      await client.query('COMMIT');
      return reply.code(201).send({ settlement: rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
