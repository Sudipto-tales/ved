// Tenant seam (plan/bridges.md §3). Holds the active tenant id, which the API client
// sends as X-Tenant-ID on every request to arm server-side RLS. At M1 the active
// tenant is resolved from the user's memberships (with a picker when there are
// several); at M0 it's chosen on the skeleton login screen.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { STORAGE } from '@/shared/lib/storage';

interface TenantState {
  activeTenantId: string | null;
  setTenant: (id: string) => void;
  clearTenant: () => void;
}

const TenantContext = createContext<TenantState | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
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
    () => ({ activeTenantId, setTenant, clearTenant }),
    [activeTenantId, setTenant, clearTenant],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantState {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within <TenantProvider>');
  return ctx;
}
