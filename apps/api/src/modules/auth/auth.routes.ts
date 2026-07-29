import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findUserForLogin, touchLastLogin } from './auth.service.js';
import type { AuthUserPayload } from '../../types/fastify.js';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.flatten() });
    }
    const { username, password } = parsed.data;

    const user = await findUserForLogin(username);
    if (!user || !user.isActive) {
      return reply.code(401).send({ error: 'invalid_credentials', message: 'Username atau password salah' });
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      return reply.code(401).send({ error: 'invalid_credentials', message: 'Username atau password salah' });
    }

    const payload: AuthUserPayload = {
      sub: user.id,
      username: user.username,
      fullName: user.fullName,
      homeOutletId: user.homeOutletId,
      outletIds: user.outletIds,
      roles: user.roles,
      permissions: user.permissions,
    };

    const token = fastify.jwt.sign(payload);
    await touchLastLogin(user.id);

    return reply.send({ token, user: payload });
  });

  fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (request, reply) => {
    return reply.send({ user: request.user });
  });
}
