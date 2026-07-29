import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * preHandler factory: require the authenticated user to hold at least one
 * of the given permission codes. Must run after `fastify.authenticate`.
 *
 * Note: permissions are a snapshot taken at login time (see auth.routes.ts),
 * so a role change takes effect on the user's next login, not instantly.
 * Acceptable trade-off for an internal system; revisit if that becomes a
 * problem (e.g. by checking a `permissions_version` column instead).
 */
export function requirePermission(...anyOf: string[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    if (!user) {
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    const hasPermission = anyOf.some((code) => user.permissions.includes(code));
    if (!hasPermission) {
      reply.code(403).send({
        error: 'forbidden',
        message: 'Anda tidak memiliki izin untuk aksi ini',
        required: anyOf,
      });
    }
  };
}
