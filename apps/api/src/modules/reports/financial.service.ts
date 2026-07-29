import { pool } from '../../db/pool.js';

export interface OutletPnl {
  outletId: string;
  outletName: string;
  revenue: number;
  revenueByMethod: { method: string; total: number }[];
  cogsRecipe: number;      // HPP from recipes of what was sold
  directMaterial: number;  // 'bahan_baku' expenses -- ad-hoc buys outside PO
  grossProfit: number;
  opexByCategory: { category: string; total: number }[];
  opex: number;
  netProfit: number;
  cashIn: number;
  cashOut: number;
  purchasesReceived: number;   // PO value received in period (stock bought, not a P&L cost)
  supplierPaidCash: number;    // POs settled in cash during the period
  supplierPaidTotal: number;   // POs settled by any method during the period
  payables: number;            // still owed to suppliers as of now (not period-bound)
}

/**
 * Profit & loss for one outlet over a period.
 *
 * Cost of sales is deliberately reported as TWO lines rather than one total:
 * recipe-based HPP (stock bought through PO, consumed by sales) and direct
 * material expenses (small ad-hoc buys recorded as 'bahan_baku'). The user
 * chose to keep both entry paths, so double counting is possible if a
 * stock-tracked ingredient is recorded through the expense path -- showing
 * them separately makes that visible instead of burying it in one figure.
 *
 * Revenue is payment-based (money received) to stay consistent with the
 * daily report. HPP is order-based, since line items only exist on orders.
 */
export async function buildOutletPnl(outletId: string, outletName: string, from: string, to: string): Promise<OutletPnl> {
  const [revenueRes, cogsRes, expenseRes, poRes, poPaidRes, payablesRes] = await Promise.all([
    pool.query(
      `SELECT method, COALESCE(SUM(amount), 0) AS total
       FROM payments
       WHERE outlet_id = $1 AND paid_at >= $2::date AND paid_at < $3::date + interval '1 day'
       GROUP BY method`,
      [outletId, from, to],
    ),
    pool.query(
      `SELECT COALESCE(SUM(oi.quantity * COALESCE(c.unit_cost, 0)), 0) AS cogs
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN (
         SELECT ri.menu_item_id, SUM(ri.quantity * i.cost_per_unit) AS unit_cost
         FROM recipe_items ri JOIN ingredients i ON i.id = ri.ingredient_id
         GROUP BY ri.menu_item_id
       ) c ON c.menu_item_id = oi.menu_item_id
       WHERE o.outlet_id = $1 AND o.status = 'completed' AND oi.status = 'active'
         AND o.created_at >= $2::date AND o.created_at < $3::date + interval '1 day'`,
      [outletId, from, to],
    ),
    pool.query(
      `SELECT category, source, COALESCE(SUM(amount), 0) AS total
       FROM outlet_expenses
       WHERE outlet_id = $1 AND expense_date >= $2::date AND expense_date <= $3::date
       GROUP BY category, source`,
      [outletId, from, to],
    ),
    pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total
       FROM purchase_orders
       WHERE outlet_id = $1 AND status = 'received'
         AND received_at >= $2::date AND received_at < $3::date + interval '1 day'`,
      [outletId, from, to],
    ),
    pool.query(
      `SELECT payment_method, COALESCE(SUM(total_amount), 0) AS total
       FROM purchase_orders
       WHERE outlet_id = $1 AND payment_status = 'paid'
         AND paid_at >= $2::date AND paid_at < $3::date + interval '1 day'
       GROUP BY payment_method`,
      [outletId, from, to],
    ),
    // Outstanding debt is a balance as of now, not a flow within the period,
    // so it is deliberately NOT date-filtered.
    pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total
       FROM purchase_orders
       WHERE outlet_id = $1 AND payment_status = 'unpaid' AND status <> 'cancelled'`,
      [outletId],
    ),
  ]);

  const revenueByMethod = revenueRes.rows.map((r) => ({ method: r.method, total: Number(r.total) }));
  const revenue = revenueByMethod.reduce((s, r) => s + r.total, 0);
  const cashIn = revenueByMethod.find((r) => r.method === 'cash')?.total ?? 0;

  const cogsRecipe = Number(cogsRes.rows[0].cogs);

  let directMaterial = 0;
  let cashOut = 0;
  const opexMap = new Map<string, number>();
  for (const row of expenseRes.rows) {
    const total = Number(row.total);
    if (row.source === 'cash_drawer') cashOut += total;
    if (row.category === 'bahan_baku') {
      directMaterial += total;
    } else {
      opexMap.set(row.category, (opexMap.get(row.category) ?? 0) + total);
    }
  }

  const opexByCategory = Array.from(opexMap, ([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
  const opex = opexByCategory.reduce((s, o) => s + o.total, 0);
  const grossProfit = revenue - cogsRecipe - directMaterial;

  return {
    outletId,
    outletName,
    revenue,
    revenueByMethod,
    cogsRecipe,
    directMaterial,
    grossProfit,
    opexByCategory,
    opex,
    netProfit: grossProfit - opex,
    cashIn,
    cashOut,
    purchasesReceived: Number(poRes.rows[0].total),
    supplierPaidCash: Number(poPaidRes.rows.find((r) => r.payment_method === 'cash')?.total ?? 0),
    supplierPaidTotal: poPaidRes.rows.reduce((s, r) => s + Number(r.total), 0),
    payables: Number(payablesRes.rows[0].total),
  };
}
