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
}
