// Platform auth seam — holds the superadmin token (separate namespace from the tenant
// app). M4's platform token implies superadmin (all platform.* perms), so hasPermission
// is true whenever authed; granular platform roles are a future refinement.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api, PLATFORM_TOKEN_KEY } from './api';

interface PlatformAuth {
  token: string | null;
  isAuthed: boolean;
  hasPermission: (perm?: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<PlatformAuth | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(PLATFORM_TOKEN_KEY));

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ access_token: string }>('/api/v1/platform/login', { email, password });
    localStorage.setItem(PLATFORM_TOKEN_KEY, res.access_token);
    setToken(res.access_token);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(PLATFORM_TOKEN_KEY);
    setToken(null);
  }, []);

  // Superadmin holds every platform permission (M4); the gate is "are you authed".
  const hasPermission = useCallback((_perm?: string) => !!token, [token]);

  const value = useMemo<PlatformAuth>(
    () => ({ token, isAuthed: !!token, hasPermission, login, logout }),
    [token, hasPermission, login, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlatformAuth(): PlatformAuth {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlatformAuth must be used within <PlatformAuthProvider>');
  return ctx;
}
