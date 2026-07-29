import type { FastifyInstance } from 'fastify';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../rbac/require-permission.js';
import { resolveOutletId } from '../../utils/outlet-scope.js';

export default async function reportsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/reports/daily', { preHandler: requirePermission('report.view_business') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const query = request.query as { from?: string; to?: string };
    const today = new Date().toISOString().slice(0, 10);
    const from = query.from ?? today;
    const to = query.to ?? from;

    const salesByMethodRes = await pool.query(
      `SELECT method, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM payments
       WHERE outlet_id = $1 AND paid_at >= $2::date AND paid_at < $3::date + interval '1 day'
       GROUP BY method ORDER BY method`,
      [outletId, from, to],
    );

    const dailyRes = await pool.query(
      `SELECT date_trunc('day', paid_at) AS day, COALESCE(SUM(amount), 0) AS total
       FROM payments
       WHERE outlet_id = $1 AND paid_at >= $2::date AND paid_at < $3::date + interval '1 day'
       GROUP BY 1 ORDER BY 1`,
      [outletId, from, to],
    );

    const expenseRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM outlet_expenses
       WHERE outlet_id = $1 AND recorded_at >= $2::date AND recorded_at < $3::date + interval '1 day'`,
      [outletId, from, to],
    );

    const orderCountRes = await pool.query(
      `SELECT COUNT(*) AS count
       FROM orders
       WHERE outlet_id = $1 AND status = 'completed' AND created_at >= $2::date AND created_at < $3::date + interval '1 day'`,
      [outletId, from, to],
    );

    const totalSales = salesByMethodRes.rows.reduce((sum, r) => sum + Number(r.total), 0);
    const totalExpense = Number(expenseRes.rows[0].total);

    return reply.send({
      from,
      to,
      totalSales,
      totalExpense,
      net: totalSales - totalExpense,
      completedOrders: Number(orderCountRes.rows[0].count),
      salesByMethod: salesByMethodRes.rows,
      daily: dailyRes.rows,
    });
  });

  // Best sellers + margin. HPP comes from each menu item's recipe valued at
  // the ingredient's CURRENT cost_per_unit -- cost is not snapshotted at sale
  // time, so margin on older periods is "what it would cost at today's
  // prices", not what it actually cost then. Surfaced as a caveat in the UI.
  // Revenue here is order-based (completed orders), unlike /reports/daily
  // which is payment-based, because line-item detail only exists on orders.
  fastify.get('/reports/products', { preHandler: requirePermission('report.view_business') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const query = request.query as { from?: string; to?: string };
    const today = new Date().toISOString().slice(0, 10);
    const from = query.from ?? today;
    const to = query.to ?? from;

    const canSeeCost = request.user.permissions.includes('report.view_management');

    const { rows } = await pool.query(
      `WITH sold AS (
         SELECT oi.menu_item_id,
                MIN(oi.item_name_snapshot) AS name,
                SUM(oi.quantity)   AS qty_sold,
                SUM(oi.line_total) AS revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.outlet_id = $1
           AND o.status = 'completed'
           AND oi.status = 'active'
           AND o.created_at >= $2::date
           AND o.created_at < $3::date + interval '1 day'
         GROUP BY oi.menu_item_id
       ),
       costs AS (
         SELECT ri.menu_item_id, SUM(ri.quantity * i.cost_per_unit) AS unit_cost
         FROM recipe_items ri
         JOIN ingredients i ON i.id = ri.ingredient_id
         GROUP BY ri.menu_item_id
       )
       SELECT s.menu_item_id, s.name, s.qty_sold, s.revenue,
              COALESCE(c.unit_cost, 0)              AS unit_cost,
              COALESCE(c.unit_cost, 0) * s.qty_sold AS total_cost,
              s.revenue - COALESCE(c.unit_cost, 0) * s.qty_sold AS margin,
              (c.unit_cost IS NULL)                 AS no_recipe
       FROM sold s
       LEFT JOIN costs c ON c.menu_item_id = s.menu_item_id
       ORDER BY s.qty_sold DESC, s.revenue DESC`,
      [outletId, from, to],
    );

    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.revenue), 0);
    const totalCost = rows.reduce((sum, r) => sum + Number(r.total_cost), 0);

    // Cost/margin is management-level data; strip it for business-only viewers
    // rather than letting the client decide what to hide.
    const products = canSeeCost
      ? rows
      : rows.map(({ unit_cost: _u, total_cost: _t, margin: _m, no_recipe: _n, ...rest }) => rest);

    return reply.send({
      from,
      to,
      showsCost: canSeeCost,
      totalRevenue,
      ...(canSeeCost ? { totalCost, totalMargin: totalRevenue - totalCost } : {}),
      products,
    });
  });
}
