import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../rbac/require-permission.js';
import { resolveOutletId } from '../../utils/outlet-scope.js';

const categoryInput = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().optional(),
});

const menuItemFields = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  sku: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  imageUrl: z.string().url().optional(),
  trackStock: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().optional(),
  // 'recipe' (default) costs from the BOM; 'purchase_price' is a direct
  // manual cost for resale items where a recipe would be pointless (e.g. a
  // bottled drink bought and sold as-is).
  hppSource: z.enum(['recipe', 'purchase_price']).default('recipe'),
  purchaseCost: z.number().nonnegative().optional(),
});

// Full-object validation (creation): the whole picture is known, so the
// hppSource/purchaseCost pairing can be checked here.
const createMenuItemInput = menuItemFields.refine(
  (d) => d.hppSource !== 'purchase_price' || (d.purchaseCost != null && d.purchaseCost > 0),
  { message: 'Harga beli wajib diisi (lebih dari 0) kalau HPP dihitung dari harga beli', path: ['purchaseCost'] },
);

// Partial updates can't know the pairing in isolation (e.g. a request that
// only touches `price` says nothing about the row's existing hppSource), so
// this stays unrefined -- the DB CHECK constraint is the backstop, caught
// and translated to a friendly message below.
const updateMenuItemInput = menuItemFields.partial();

export default async function menuRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // --- Categories ----------------------------------------------------------

  fastify.get('/categories', { preHandler: requirePermission('menu.view') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { rows } = await pool.query(
      `SELECT id, name, sort_order, is_active FROM categories
       WHERE outlet_id = $1 ORDER BY sort_order, name`,
      [outletId],
    );
    return reply.send({ categories: rows });
  });

  fastify.post('/categories', { preHandler: requirePermission('menu.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const parsed = categoryInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });

    const { rows } = await pool.query(
      `INSERT INTO categories (outlet_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id, name, sort_order, is_active`,
      [outletId, parsed.data.name, parsed.data.sortOrder],
    );
    return reply.code(201).send({ category: rows[0] });
  });

  fastify.put('/categories/:id', { preHandler: requirePermission('menu.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const parsed = categoryInput.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });

    const { rows } = await pool.query(
      `UPDATE categories SET
         name = COALESCE($3, name),
         sort_order = COALESCE($4, sort_order),
         is_active = COALESCE($5, is_active)
       WHERE id = $1 AND outlet_id = $2
       RETURNING id, name, sort_order, is_active`,
      [id, outletId, parsed.data.name ?? null, parsed.data.sortOrder ?? null, parsed.data.isActive ?? null],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ category: rows[0] });
  });

  fastify.delete('/categories/:id', { preHandler: requirePermission('menu.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const { rowCount } = await pool.query(`UPDATE categories SET is_active = false WHERE id = $1 AND outlet_id = $2`, [id, outletId]);
    if (rowCount === 0) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });

  // --- Menu items ------------------------------------------------------------

  fastify.get('/menu-items', { preHandler: requirePermission('menu.view') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { rows } = await pool.query(
      `SELECT id, category_id, sku, name, description, price, image_url, track_stock, is_active, sort_order, hpp_source, purchase_cost
       FROM menu_items
       WHERE outlet_id = $1
       ORDER BY sort_order, name`,
      [outletId],
    );
    return reply.send({ menuItems: rows });
  });

  fastify.post('/menu-items', { preHandler: requirePermission('menu.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const parsed = createMenuItemInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    const { rows } = await pool.query(
      `INSERT INTO menu_items (outlet_id, category_id, sku, name, description, price, image_url, track_stock, sort_order, hpp_source, purchase_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, category_id, sku, name, description, price, image_url, track_stock, is_active, sort_order, hpp_source, purchase_cost`,
      [outletId, d.categoryId ?? null, d.sku ?? null, d.name, d.description ?? null, d.price, d.imageUrl ?? null, d.trackStock, d.sortOrder, d.hppSource, d.hppSource === 'purchase_price' ? d.purchaseCost : null],
    );
    return reply.code(201).send({ menuItem: rows[0] });
  });

  fastify.put('/menu-items/:id', { preHandler: requirePermission('menu.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const parsed = updateMenuItemInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    try {
      const { rows } = await pool.query(
        `UPDATE menu_items SET
           category_id = COALESCE($3, category_id),
           sku = COALESCE($4, sku),
           name = COALESCE($5, name),
           description = COALESCE($6, description),
           price = COALESCE($7, price),
           image_url = COALESCE($8, image_url),
           track_stock = COALESCE($9, track_stock),
           sort_order = COALESCE($10, sort_order),
           is_active = COALESCE($11, is_active),
           hpp_source = COALESCE($12, hpp_source),
           purchase_cost = CASE WHEN $12::text IS NOT NULL THEN $13 ELSE COALESCE($13, purchase_cost) END
         WHERE id = $1 AND outlet_id = $2
         RETURNING id, category_id, sku, name, description, price, image_url, track_stock, is_active, sort_order, hpp_source, purchase_cost`,
        [id, outletId, d.categoryId ?? null, d.sku ?? null, d.name ?? null, d.description ?? null, d.price ?? null, d.imageUrl ?? null, d.trackStock ?? null, d.sortOrder ?? null, d.isActive ?? null, d.hppSource ?? null, d.purchaseCost ?? null],
      );
      if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
      return reply.send({ menuItem: rows[0] });
    } catch (err: any) {
      if (err?.code === '23514' && err?.constraint === 'menu_items_purchase_cost_required') {
        return reply.code(400).send({ error: 'invalid_request', message: 'Harga beli wajib diisi kalau HPP dihitung dari harga beli' });
      }
      throw err;
    }
  });

  fastify.delete('/menu-items/:id', { preHandler: requirePermission('menu.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const { rowCount } = await pool.query(`UPDATE menu_items SET is_active = false WHERE id = $1 AND outlet_id = $2`, [id, outletId]);
    if (rowCount === 0) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });
}
