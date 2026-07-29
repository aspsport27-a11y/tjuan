import { useAuthStore } from '../store/auth';

// Falls back to a same-origin relative path if the build-time env var is
// missing -- a silently undefined BASE_URL used to bake the literal string
// "undefined" into every request URL, breaking all POST/PUT/DELETE calls
// (nginx's static-file fallback serves GET fine but 405s any other method).
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(extractErrorMessage(body, status));
  }
}

// Route validation failures (400 invalid_request) come back as
// { error, issues: zod.flatten() } with no top-level "message" -- surface
// the actual field errors instead of a generic "Request failed (400)".
function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    if ('message' in body && typeof (body as { message: unknown }).message === 'string') {
      return (body as { message: string }).message;
    }
    if ('issues' in body) {
      const issues = (body as { issues?: { fieldErrors?: Record<string, string[]> } }).issues;
      const messages = Object.entries(issues?.fieldErrors ?? {}).flatMap(([field, msgs]) => msgs.map((m) => `${field}: ${m}`));
      if (messages.length > 0) return messages.join('; ');
    }
  }
  return `Request failed (${status})`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      // Only declare a JSON body when one is actually being sent -- Fastify's
      // JSON parser rejects a request with this header but an empty body
      // (e.g. POST /order-items/:id/cancel), even though no body was intended.
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    useAuthStore.getState().clearSession();
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // no JSON body
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
