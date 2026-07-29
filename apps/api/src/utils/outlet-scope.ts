import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Resolve which outlet a request should operate against.
 *
 * Single-outlet deployments never pass ?outlet_id, so this just returns the
 * user's home outlet. Once a user has access to multiple outlets, the
 * client can pass ?outlet_id=<uuid> and we validate it against the JWT's
 * outletIds allowlist rather than trusting the client blindly.
 */
export function resolveOutletId(request: FastifyRequest, reply: FastifyReply): string | null {
  const query = request.query as Record<string, unknown>;
  const requested = typeof query?.outlet_id === 'string' ? query.outlet_id : undefined;

  if (!requested) {
    return request.user.homeOutletId;
  }

  if (!request.user.outletIds.includes(requested)) {
    reply.code(403).send({ error: 'forbidden', message: 'Tidak memiliki akses ke outlet ini' });
    return null;
  }

  return requested;
}
