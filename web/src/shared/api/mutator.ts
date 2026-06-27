// Orval custom mutator: the single HTTP call the generated client routes through, so
// the JWT (auth seam) + X-Tenant-* (tenant-context seam) injection lives in ONE place
// (plan/bridges.md §1). Generated hooks call customFetch; customFetch reuses the same
// base/headers logic as the legacy shared `api` client.
import { STORAGE } from '@/shared/lib/storage';
import { apiBase, hostTenant } from '@/shared/tenant/host';
import { ApiError } from '@/shared/api/client';

export interface RequestConfig {
  url: string;
  method: string;
  params?: Record<string, unknown>;
  data?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  responseType?: string;
}

function buildUrl(url: string, params?: Record<string, unknown>): string {
  const full = `${apiBase()}${url}`;
  if (!params) return full;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `${full}?${s}` : full;
}

export async function customFetch<T>(config: RequestConfig): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(config.headers ?? {}),
  };

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

  const res = await fetch(buildUrl(config.url, config.params), {
    method: config.method.toUpperCase(),
    headers,
    body: config.data !== undefined ? JSON.stringify(config.data) : undefined,
    signal: config.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export default customFetch;
