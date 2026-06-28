// Tenant seam (plan/bridges.md §3, docs/25). The active tenant is determined two ways:
//  - Subdomain ({slug}.ved.*): the slug IS the tenant; the API client sends X-Tenant-Slug
//    and the picker is skipped.
//  - Bare host (localhost): the user picks a tenant; we store its id and send X-Tenant-ID.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { STORAGE } from '@/shared/lib/storage';
import { hostTenant } from '@/shared/tenant/host';
import { useAuth } from '@/shared/auth/AuthProvider';

interface TenantState {
  activeTenantId: string | null;
  /** Tenant slug from the subdomain ({slug}.ved.*), or null on a bare host. */
  tenantSlug: string | null;
  /** Whether a tenant context exists (subdomain slug OR a picked id). */
  hasTenant: boolean;
  setTenant: (id: string) => void;
  clearTenant: () => void;
}

const TenantContext = createContext<TenantState | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const host = hostTenant(); // stable for the page's lifetime
  const { memberships } = useAuth();
  // Bare-host (localhost) picker selection — irrelevant on a subdomain.
  const [picked, setPicked] = useState<string | null>(
    () => localStorage.getItem(STORAGE.tenant),
  );

  // On a {slug}.ved.* subdomain the tenant is implied by the host, so there is no picker.
  // Derive the active tenant_id from the membership whose slug matches the subdomain (or
  // the sole membership when slug isn't carried on an older session). Without this,
  // activeTenantId stays null on subdomains and everything keyed on it silently breaks:
  // permission sync (useSyncPermissions gates on activeTenantId) never loads, so every
  // <Can>/<PermissionGuard> fails closed and admin actions (e.g. "Onboard student")
  // vanish; persona + sidebar brand also fall back wrongly (docs/25).
  const subdomainTenantId = host
    ? (memberships.find((m) => m.slug === host.slug)?.tenant_id ??
       (memberships.length === 1 ? memberships[0].tenant_id : null))
    : null;

  const activeTenantId = host ? subdomainTenantId : picked;

  const setTenant = useCallback((id: string) => {
    localStorage.setItem(STORAGE.tenant, id);
    setPicked(id);
  }, []);

  const clearTenant = useCallback(() => {
    localStorage.removeItem(STORAGE.tenant);
    setPicked(null);
  }, []);

  const value = useMemo<TenantState>(
    () => ({
      activeTenantId,
      tenantSlug: host?.slug ?? null,
      hasTenant: !!host || !!activeTenantId,
      setTenant,
      clearTenant,
    }),
    [activeTenantId, host, setTenant, clearTenant],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantState {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within <TenantProvider>');
  return ctx;
}
