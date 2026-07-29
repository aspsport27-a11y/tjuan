import '@fastify/jwt';

export interface AuthUserPayload {
  sub: string; // user id
  username: string;
  fullName: string;
  homeOutletId: string;
  outletIds: string[]; // outlets this user may operate in
  roles: string[]; // role codes
  permissions: string[]; // flattened permission codes, snapshot at login time
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUserPayload;
    user: AuthUserPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}
