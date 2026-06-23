// The platform SPA's API client — talks to the CONTROL PLANE binary (port 8080), a
// different origin and a SEPARATE token namespace from the tenant app (docs/02, docs/05).
// Same-origin (relative) behind nginx on a VED host (platform.ved.*); the dev default
// (control plane :8080) on a bare host. (docs/25-subdomain-routing.md)
const onVedHost =
  typeof location !== 'undefined' && /(^|\.)ved\.(test|com)$/.test(location.hostname);
const BASE = onVedHost ? '' : (import.meta.env.VITE_PLATFORM_API_URL ?? 'http://localhost:8080');

export const PLATFORM_TOKEN_KEY = 'ved.platform.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem(PLATFORM_TOKEN_KEY);
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // A 401 on a request we authenticated means the stored token is stale/expired (e.g.
    // left over from a previous control-plane instance). Don't let it wedge every page:
    // clear it and send the user back to login. (Skip for the login call itself, where a
    // 401 is just bad credentials and there's no token to clear.)
    if (res.status === 401 && token && !path.includes('/platform/login')) {
      localStorage.removeItem(PLATFORM_TOKEN_KEY);
      if (typeof location !== 'undefined' && !location.pathname.endsWith('/login')) {
        location.assign('/login');
      }
    }
    throw new ApiError(res.status, text || res.statusText);
  }
  if (res.status === 204 || res.status === 202) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
