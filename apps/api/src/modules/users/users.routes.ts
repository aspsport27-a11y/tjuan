import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../rbac/require-permission.js';
import { resolveOutletId } from '../../utils/outlet-scope.js';
import { adminResetPassword, createUser, listUsers, updateUserProfile, updateUserRoles } from './users.service.js';

const createUserInput = z.object({
  username: z
    .string()
    .min(3)
    .regex(/^[a-z0-9._-]+$/i, 'Username hanya boleh huruf, angka, titik, underscore, strip'),
  fullName: z.string().min(1),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  roleCodes: z.array(z.string()).min(1, 'Pilih minimal 1 role'),
});

const updateUserInput = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  roleCodes: z.array(z.string()).optional(),
});

const resetPasswordInput = z.object({
  newPassword: z.string().min(8, 'Password minimal 8 karakter'),
});

export default async function usersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/users', { preHandler: requirePermission('user.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const users = await listUsers(outletId);
    return reply.send({ users });
  });

  fastify.get('/roles', { preHandler: requirePermission('user.manage') }, async (_request, reply) => {
    const { rows } = await pool.query(`SELECT code, name FROM roles ORDER BY name`);
    return reply.send({ roles: rows });
  });

  fastify.post('/users', { preHandler: requirePermission('user.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const parsed = createUserInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });

    try {
      const id = await createUser({ outletId, ...parsed.data });
      return reply.code(201).send({ id });
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        return reply.code(409).send({ error: 'username_taken', message: 'Username sudah dipakai' });
      }
      throw err;
    }
  });

  fastify.put('/users/:id', { preHandler: requirePermission('user.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const parsed = updateUserInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });

    const owned = await pool.query(`SELECT id FROM users WHERE id = $1 AND home_outlet_id = $2`, [id, outletId]);
    if (owned.rows.length === 0) return reply.code(404).send({ error: 'not_found' });

    await updateUserProfile(id, parsed.data);
    if (parsed.data.roleCodes) {
      await updateUserRoles(id, parsed.data.roleCodes);
    }
    return reply.send({ updated: true });
  });

  // Admin-driven reset: no current-password check, unlike /auth/change-password.
  fastify.post('/users/:id/reset-password', { preHandler: requirePermission('user.manage') }, async (request, reply) => {
    const outletId = resolveOutletId(request, reply);
    if (!outletId) return;
    const { id } = request.params as { id: string };
    const parsed = resetPasswordInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });

    const owned = await pool.query(`SELECT id FROM users WHERE id = $1 AND home_outlet_id = $2`, [id, outletId]);
    if (owned.rows.length === 0) return reply.code(404).send({ error: 'not_found' });

    await adminResetPassword(id, parsed.data.newPassword);
    return reply.send({ reset: true });
  });
}
