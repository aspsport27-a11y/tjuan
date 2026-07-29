import type { PoolClient } from 'pg';

/**
 * Atomically get the next order number for an outlet's current business
 * date, e.g. "20260729-0007". Uses INSERT ... ON CONFLICT DO UPDATE so
 * concurrent requests never see the same counter value.
 */
export async function nextOrderNumber(client: PoolClient, outletId: string): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO order_number_counters (outlet_id, business_date, counter)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (outlet_id, business_date)
     DO UPDATE SET counter = order_number_counters.counter + 1
     RETURNING counter, business_date`,
    [outletId],
  );
  const { counter, business_date } = rows[0];
  const datePart = new Date(business_date).toISOString().slice(0, 10).replace(/-/g, '');
  return `${datePart}-${String(counter).padStart(4, '0')}`;
}

export interface OrderTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  serviceChargeTotal: number;
  grandTotal: number;
}

/** Recompute and persist order totals from its active line items. */
export async function recalculateOrderTotals(client: PoolClient, orderId: string): Promise<OrderTotals> {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(line_total), 0) AS subtotal
     FROM order_items WHERE order_id = $1 AND status = 'active'`,
    [orderId],
  );
  const subtotal = Number(rows[0].subtotal);

  const { rows: orderRows } = await client.query(
    `SELECT discount_total, tax_total, service_charge_total FROM orders WHERE id = $1`,
    [orderId],
  );
  const discountTotal = Number(orderRows[0].discount_total);
  const taxTotal = Number(orderRows[0].tax_total);
  const serviceChargeTotal = Number(orderRows[0].service_charge_total);
  const grandTotal = subtotal - discountTotal + taxTotal + serviceChargeTotal;

  await client.query(
    `UPDATE orders SET subtotal = $2, grand_total = $3 WHERE id = $1`,
    [orderId, subtotal, grandTotal],
  );

  return { subtotal, discountTotal, taxTotal, serviceChargeTotal, grandTotal };
}
