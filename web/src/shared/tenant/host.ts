// Subdomain → tenant resolution (docs/25-subdomain-routing.md). A school is reached at
// {slug}.ved.test / {slug}.ved.com — the subdomain IS the tenant, verbatim. When the app
// is served from such a host, the active tenant is implied by the URL — no picker — and
// the API is same-origin (no CORS). Everyone (admin/staff/teacher/student/guardian) signs
// in at this one host; persona routing happens inside the app (PersonaHome → /teacher,
// /student, …). On a bare host (localhost/IP) we fall back to the legacy picker + an
// explicit X-Tenant-ID.
import { env } from '@/shared/config/env';
import { isReservedSlug } from '@/shared/tenant/reserved';

const ROOTS = ['ved.test', 'ved.com'];

export interface HostTenant {
  slug: string;
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
      if (sub.includes('.') || isReservedSlug(sub)) return null; // deeper/reserved → not a tenant
      return { slug: sub };
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
