import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../rbac/require-permission.js';

const outletInput = z.object({
  code: z
    .string()
    .min(2)
    .regex(/^[a-z0-9._-]+$/i, 'Kode hanya boleh huruf, angka, titik, underscore, strip'),
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
});

const updateOutletInput = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export default async function outletsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // Every authenticated user can list the outlets they have access to
  // (needed to populate the outlet switcher) -- not gated by outlet.manage,
  // which is reserved for create/edit.
  fastify.get('/outlets', async (request, reply) => {
    const { rows } = await pool.query(
      `SELECT id, code, name, address, phone, is_active
       FROM outlets
       WHERE id = ANY($1::uuid[])
       ORDER BY name`,
      [request.user.outletIds],
    );
    return reply.send({ outlets: rows });
  });

  fastify.post('/outlets', { preHandler: requirePermission('outlet.manage') }, async (request, reply) => {
    const parsed = outletInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    try {
      const { rows } = await pool.query(
        `INSERT INTO outlets (code, name, address, phone) VALUES ($1, $2, $3, $4)
         RETURNING id, code, name, address, phone, is_active`,
        [d.code, d.name, d.address ?? null, d.phone ?? null],
      );
      return reply.code(201).send({ outlet: rows[0] });
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        return reply.code(409).send({ error: 'code_taken', message: 'Kode outlet sudah dipakai' });
      }
      throw err;
    }
  });

  fastify.put('/outlets/:id', { preHandler: requirePermission('outlet.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateOutletInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    const d = parsed.data;

    const { rows } = await pool.query(
      `UPDATE outlets SET
         name = COALESCE($2, name),
         address = COALESCE($3, address),
         phone = COALESCE($4, phone),
         is_active = COALESCE($5, is_active)
       WHERE id = $1
       RETURNING id, code, name, address, phone, is_active`,
      [id, d.name ?? null, d.address ?? null, d.phone ?? null, d.isActive ?? null],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ outlet: rows[0] });
  });
}
