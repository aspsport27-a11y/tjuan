import type { FastifyInstance } from 'fastify';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../rbac/require-permission.js';
import { resolveOutletId } from '../../utils/outlet-scope.js';
import { buildOutletPnl } from './financial.service.js';

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

    // expense_date, not recorded_at: an expense belongs to the day it
    // economically occurred, not the day someone got around to typing it in.
    const expenseRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM outlet_expenses
       WHERE outlet_id = $1 AND expense_date >= $2::date AND expense_date <= $3::date`,
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
       -- Cost source is per menu item: 'purchase_price' items carry their own
       -- manual cost, 'recipe' items still cost from the BOM. no_recipe only
       -- flags the genuine gap -- a 'recipe' item nobody built a recipe for --
       -- not a 'purchase_price' item, which is costed on purpose.
       costs AS (
         SELECT mi.id AS menu_item_id,
                CASE WHEN mi.hpp_source = 'purchase_price' THEN COALESCE(mi.purchase_cost, 0)
                     ELSE COALESCE(rc.unit_cost, 0) END AS unit_cost,
                (mi.hpp_source = 'recipe' AND rc.unit_cost IS NULL) AS no_recipe
         FROM menu_items mi
         LEFT JOIN (
           SELECT ri.menu_item_id, SUM(ri.quantity * i.cost_per_unit) AS unit_cost
           FROM recipe_items ri
           JOIN ingredients i ON i.id = ri.ingredient_id
           GROUP BY ri.menu_item_id
         ) rc ON rc.menu_item_id = mi.id
       )
       SELECT s.menu_item_id, s.name, s.qty_sold, s.revenue,
              COALESCE(c.unit_cost, 0)              AS unit_cost,
              COALESCE(c.unit_cost, 0) * s.qty_sold AS total_cost,
              s.revenue - COALESCE(c.unit_cost, 0) * s.qty_sold AS margin,
              COALESCE(c.no_recipe, false)          AS no_recipe
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

  // Full P&L for one outlet. Cost/margin is management-level data, so this
  // endpoint requires report.view_management rather than view_business.
  fastify.get('/reports/financial', { preHandler: requirePermission('report.view_management') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const query = request.query as { from?: string; to?: string };
    const today = new Date().toISOString().slice(0, 10);
    const from = query.from ?? today;
    const to = query.to ?? from;

    const outletRes = await pool.query(`SELECT id, name FROM outlets WHERE id = $1`, [outletId]);
    if (outletRes.rows.length === 0) return reply.code(404).send({ error: 'not_found' });

    const pnl = await buildOutletPnl(outletId, outletRes.rows[0].name, from, to);
    return reply.send({ from, to, ...pnl });
  });

  // Side-by-side P&L across every outlet the caller can see -- the owner view
  // that answers "which outlet actually makes money".
  fastify.get('/reports/financial/consolidated', { preHandler: requirePermission('report.view_management') }, async (request, reply) => {
    const query = request.query as { from?: string; to?: string };
    const today = new Date().toISOString().slice(0, 10);
    const from = query.from ?? today;
    const to = query.to ?? from;

    const outletsRes = await pool.query(
      `SELECT id, name FROM outlets WHERE id = ANY($1::uuid[]) ORDER BY name`,
      [request.user.outletIds],
    );

    const outlets = await Promise.all(
      outletsRes.rows.map((o) => buildOutletPnl(o.id, o.name, from, to)),
    );

    const sum = (pick: (o: (typeof outlets)[number]) => number) => outlets.reduce((s, o) => s + pick(o), 0);

    return reply.send({
      from,
      to,
      outlets,
      total: {
        revenue: sum((o) => o.revenue),
        cogsRecipe: sum((o) => o.cogsRecipe),
        directMaterial: sum((o) => o.directMaterial),
        grossProfit: sum((o) => o.grossProfit),
        opex: sum((o) => o.opex),
        netProfit: sum((o) => o.netProfit),
      },
    });
  });
}
