// The ONLY way the app talks to the backend. Every feature's api/ hooks call this;
// no component hand-rolls fetch (plan/bridges.md §1). It injects the JWT (auth seam)
// and the X-Tenant-ID header (tenant-context seam) on every request.
//
// At M0 this is a thin typed fetch wrapper. When the OpenAPI spec stabilises, the
// generated client drops in here behind the same `api` surface.
//
// Tenant context: on a {slug}.ved.* host we send X-Tenant-Slug (the subdomain) and call a
// same-origin /api (no CORS); on bare localhost we keep the legacy X-Tenant-ID + dev base.
import { STORAGE } from '@/shared/lib/storage';
import { apiBase, hostTenant } from '@/shared/tenant/host';

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

  const token = localStorage.getItem(STORAGE.token);
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Subdomain host → tenant by slug; otherwise the explicit id chosen via the picker.
  const host = hostTenant();
  if (host) {
    headers['X-Tenant-Slug'] = host.slug;
  } else {
    const tenant = localStorage.getItem(STORAGE.tenant);
    if (tenant) headers['X-Tenant-ID'] = tenant;
  }

  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
