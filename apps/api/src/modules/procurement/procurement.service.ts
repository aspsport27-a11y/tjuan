import type { PoolClient } from 'pg';

/** Atomic per-outlet-per-day PO number, e.g. "PO-20260729-0003". */
export async function nextPoNumber(client: PoolClient, outletId: string): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO purchase_order_number_counters (outlet_id, business_date, counter)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (outlet_id, business_date)
     DO UPDATE SET counter = purchase_order_number_counters.counter + 1
     RETURNING counter, business_date`,
    [outletId],
  );
  const { counter, business_date } = rows[0];
  const datePart = new Date(business_date).toISOString().slice(0, 10).replace(/-/g, '');
  return `PO-${datePart}-${String(counter).padStart(4, '0')}`;
}
