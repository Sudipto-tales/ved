// Orval custom mutator for the PLATFORM SPA — routes the generated control-plane client
// through the same transport as the hand-written `api` (control plane :8080, separate
// platform-token namespace). Mirrors web/src/shared/api/mutator.ts but for this plane.
import { PLATFORM_TOKEN_KEY, ApiError } from './api';

const onVedHost =
  typeof location !== 'undefined' && /(^|\.)ved\.(test|com)$/.test(location.hostname);
const BASE = onVedHost ? '' : ((import.meta as any).env?.VITE_PLATFORM_API_URL ?? 'http://localhost:8080');

export interface RequestConfig {
  url: string;
  method: string;
  params?: Record<string, unknown>;
  data?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function platformFetch<T>(config: RequestConfig): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(config.headers ?? {}) };
  const token = localStorage.getItem(PLATFORM_TOKEN_KEY);
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let url = `${BASE}${config.url}`;
  if (config.params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(config.params)) {
      if (v !== undefined && v !== null) qs.append(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const res = await fetch(url, {
    method: config.method.toUpperCase(),
    headers,
    body: config.data !== undefined ? JSON.stringify(config.data) : undefined,
    signal: config.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Stale/expired token → clear it and bounce to login (see shared/api.ts).
    if (res.status === 401 && token && !config.url.includes('/platform/login')) {
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

export default platformFetch;
