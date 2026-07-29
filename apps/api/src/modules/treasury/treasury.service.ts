import type { Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';

export type LedgerKind =
  | 'cash_deposit'
  | 'settlement'
  | 'expense'
  | 'purchase_payment'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment';

/**
 * Append one ledger row. The ledger is never updated in place -- a correction
 * is another row -- so any balance can be traced to the entries behind it.
 */
export async function postLedger(
  db: Pool | PoolClient,
  params: {
    accountId: string;
    direction: 'in' | 'out';
    amount: number;
    kind: LedgerKind;
    referenceType?: string | null;
    referenceId?: string | null;
    txDate?: string | null;
    notes?: string | null;
    userId: string | null;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO account_transactions
       (account_id, direction, amount, kind, reference_type, reference_id, tx_date, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE), $8, $9)`,
    [
      params.accountId,
      params.direction,
      params.amount,
      params.kind,
      params.referenceType ?? null,
      params.referenceId ?? null,
      params.txDate ?? null,
      params.notes ?? null,
      params.userId,
    ],
  );
}

/**
 * Reverse whatever was posted for a reference (used when an expense that
 * drew from an account is deleted). Posts a compensating row rather than
 * deleting, keeping the trail intact.
 */
export async function reverseLedgerFor(
  db: Pool | PoolClient,
  referenceType: string,
  referenceId: string,
  userId: string | null,
): Promise<void> {
  const { rows } = await db.query(
    `SELECT account_id, direction, amount FROM account_transactions
     WHERE reference_type = $1 AND reference_id = $2 AND kind <> 'adjustment'`,
    [referenceType, referenceId],
  );
  for (const r of rows) {
    await postLedger(db, {
      accountId: r.account_id,
      direction: r.direction === 'in' ? 'out' : 'in',
      amount: Number(r.amount),
      kind: 'adjustment',
      referenceType: `${referenceType}_reversal`,
      referenceId,
      notes: 'Pembatalan transaksi terkait',
      userId,
    });
  }
}

/**
 * Accounts visible to a caller: the outlet's own accounts plus every central
 * (outlet_id IS NULL) account, which any outlet may pay from.
 */
export async function listAccountsWithBalance(outletId: string) {
  const { rows } = await pool.query(
    `SELECT a.id, a.outlet_id, a.name, a.type, a.bank_name, a.account_number,
            a.opening_balance, a.is_active,
            o.name AS outlet_name,
            a.opening_balance
              + COALESCE(t.total_in, 0)
              - COALESCE(t.total_out, 0) AS balance
     FROM accounts a
     LEFT JOIN outlets o ON o.id = a.outlet_id
     LEFT JOIN (
       SELECT account_id,
              SUM(amount) FILTER (WHERE direction = 'in')  AS total_in,
              SUM(amount) FILTER (WHERE direction = 'out') AS total_out
       FROM account_transactions GROUP BY account_id
     ) t ON t.account_id = a.id
     WHERE a.outlet_id = $1 OR a.outlet_id IS NULL
     ORDER BY a.outlet_id NULLS FIRST, a.name`,
    [outletId],
  );
  return rows;
}

/** Guard: an account must belong to this outlet or be a central account. */
export async function assertAccountUsable(db: Pool | PoolClient, accountId: string, outletId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT id FROM accounts WHERE id = $1 AND (outlet_id = $2 OR outlet_id IS NULL)`,
    [accountId, outletId],
  );
  return rows.length > 0;
}
