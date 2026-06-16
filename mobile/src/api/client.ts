// The single HTTP seam for the mobile app. Mirrors the web client's contract: a Bearer
// access token + the X-Tenant-Slug header (the node resolves slug → tenant_id and arms RLS).
// Every guardian read is restricted server-side to the caller's own children, so the client
// just renders what it gets back.

export type Session = {
  serverUrl: string; // e.g. http://10.0.2.2:8091 (no trailing slash)
  slug: string; // tenant slug, sent as X-Tenant-Slug
  token: string; // JWT access token
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + (path.startsWith('/') ? path : '/' + path);
}

async function parse(res: Response): Promise<any> {
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = (body && (body.error || body.message)) || `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return body;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

// login is cross-tenant (no tenant header): it returns a token carrying the user's
// memberships. Used before a Session exists.
export async function login(
  serverUrl: string,
  loginIdentifier: string,
  password: string,
): Promise<{ access_token: string; must_reset_password?: boolean }> {
  const res = await fetch(joinUrl(serverUrl, '/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_identifier: loginIdentifier, password }),
  });
  return parse(res);
}

// apiGet performs an authenticated, tenant-scoped GET.
export async function apiGet<T = any>(session: Session, path: string): Promise<T> {
  const res = await fetch(joinUrl(session.serverUrl, path), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'X-Tenant-Slug': session.slug,
    },
  });
  return parse(res);
}
