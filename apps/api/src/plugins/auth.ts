import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

// Registers @fastify/jwt and decorates the instance with `authenticate`,
// a preHandler that verifies the bearer token and populates request.user.
// Permission checks live separately in modules/rbac (kept decoupled so
// "is this a valid session" and "is this session allowed to do X" don't
// get tangled together).
export default fp(async function authPlugin(fastify: FastifyInstance) {
  fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'unauthorized', message: 'Token tidak valid atau sudah kedaluwarsa' });
    }
  });
});
