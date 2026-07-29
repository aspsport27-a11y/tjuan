import type { Pool, PoolClient } from 'pg';

/** Atomic per-outlet-per-day shift number (mirrors nextOrderNumber). */
export async function nextShiftNumber(client: PoolClient, outletId: string): Promise<number> {
  const { rows } = await client.query(
    `INSERT INTO shift_number_counters (outlet_id, business_date, counter)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (outlet_id, business_date)
     DO UPDATE SET counter = shift_number_counters.counter + 1
     RETURNING counter`,
    [outletId],
  );
  return rows[0].counter;
}

export async function getOpenShiftId(db: Pool | PoolClient, outletId: string): Promise<string | null> {
  const { rows } = await db.query(`SELECT id FROM shifts WHERE outlet_id = $1 AND status = 'open'`, [outletId]);
  return rows[0]?.id ?? null;
}

/** Cash expected in the drawer: opening float + cash payments − outlet expenses recorded this shift. */
export async function computeExpectedCash(db: Pool | PoolClient, shiftId: string, openingCash: number): Promise<number> {
  const { rows: cashRows } = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE shift_id = $1 AND method = 'cash'`,
    [shiftId],
  );
  const { rows: expenseRows } = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM outlet_expenses WHERE shift_id = $1`,
    [shiftId],
  );
  return Number(openingCash) + Number(cashRows[0].total) - Number(expenseRows[0].total);
}
