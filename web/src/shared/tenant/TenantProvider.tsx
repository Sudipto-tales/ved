// Tenant seam (plan/bridges.md §3, docs/25). The active tenant is determined two ways:
//  - Subdomain ({slug}.ved.*): the slug IS the tenant; the API client sends X-Tenant-Slug
//    and the picker is skipped.
//  - Bare host (localhost): the user picks a tenant; we store its id and send X-Tenant-ID.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { STORAGE } from '@/shared/lib/storage';
import { hostTenant } from '@/shared/tenant/host';

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
  const [activeTenantId, setActiveTenantId] = useState<string | null>(
    () => localStorage.getItem(STORAGE.tenant),
  );

  const setTenant = useCallback((id: string) => {
    localStorage.setItem(STORAGE.tenant, id);
    setActiveTenantId(id);
  }, []);

  const clearTenant = useCallback(() => {
    localStorage.removeItem(STORAGE.tenant);
    setActiveTenantId(null);
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
