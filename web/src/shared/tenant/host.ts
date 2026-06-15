// Subdomain → tenant resolution (docs/25-subdomain-routing.md). A school is reached at
// {slug}.ved.test / {slug}.ved.com (and {slug}-admin.… for the admin entry). When the app
// is served from such a host, the active tenant is implied by the URL — no picker — and
// the API is same-origin (no CORS). On a bare host (localhost/IP) we fall back to the
// legacy picker + explicit X-Tenant-ID.
import { env } from '@/shared/config/env';

const ROOTS = ['ved.test', 'ved.com'];
const RESERVED = new Set(['platform', 'www', 'app', 'api']);

export interface HostTenant {
  slug: string;
  admin: boolean;
}

function hostname(): string {
  return typeof location !== 'undefined' ? location.hostname : '';
}

/** The tenant implied by the current host, or null on a bare/apex/reserved host. */
export function hostTenant(): HostTenant | null {
  const h = hostname();
  for (const root of ROOTS) {
    if (h === root) return null; // apex (marketing/signup)
    if (h.endsWith('.' + root)) {
      const sub = h.slice(0, h.length - root.length - 1); // strip ".ved.test"
      if (sub.includes('.') || RESERVED.has(sub)) return null; // deeper/reserved → not a tenant
      const admin = sub.endsWith('-admin');
      return { slug: admin ? sub.slice(0, -'-admin'.length) : sub, admin };
    }
  }
  return null;
}

/** True when served from a VED host (so the API is same-origin behind nginx). */
export function onVedHost(): boolean {
  const h = hostname();
  return ROOTS.some((r) => h === r || h.endsWith('.' + r));
}

/** API base: relative (same-origin) behind nginx on a VED host; the dev default otherwise. */
export function apiBase(): string {
  return onVedHost() ? '' : env.apiUrl;
}
