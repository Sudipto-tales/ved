// Auth seam (plan/bridges.md §2, §4). Holds the session (access + refresh tokens, the
// user's memberships, the must-reset flag) and the EFFECTIVE permission set for the
// active tenant. M2: permissions are real — resolved server-side from the membership's
// roles via GET /api/v1/me/permissions and loaded once a tenant is active (the dev
// wildcard from M1 is gone). The cosmetic <Can> gate and the route <PermissionGuard>
// read this set; the server's requirePermission remains authoritative.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { STORAGE } from '@/shared/lib/storage';
import { useTenant } from '@/shared/tenant/TenantProvider';

export interface Membership {
  membership_id: string;
  tenant_id: string;
  user_type: string;
  /** School/college display name + slug — drive the sidebar brand + welcome (docs/24). */
  tenant_name?: string;
  slug?: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  mustReset: boolean;
  /** The signed-in user's login handle (account chip); survives reload via localStorage. */
  login?: string;
  memberships: Membership[];
}

interface AuthState {
  token: string | null;
  memberships: Membership[];
  /** The signed-in user's login handle, or null on an older/odd-path session. */
  loginHandle: string | null;
  mustReset: boolean;
  permissions: string[];
  /** False until the effective permission set for the active tenant has loaded. */
  permissionsReady: boolean;
  isAuthed: boolean;
  hasPermission: (perm?: string) => boolean;
  login: (session: Session) => void;
  setPermissions: (perms: string[]) => void;
  resetPermissions: () => void;
  clearMustReset: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE.token));
  const [memberships, setMemberships] = useState<Membership[]>(() =>
    readJSON<Membership[]>(STORAGE.memberships, []),
  );
  const [loginHandle, setLoginHandle] = useState<string | null>(
    () => localStorage.getItem(STORAGE.login),
  );
  const [mustReset, setMustReset] = useState<boolean>(
    () => readJSON<{ mustReset?: boolean }>(STORAGE.session, {}).mustReset ?? false,
  );
  // Permissions persist across reloads (so a refresh doesn't flash unauthorised), but
  // are re-fetched whenever the active tenant changes (see useSyncPermissions).
  const [permissions, setPermsState] = useState<string[]>(() =>
    readJSON<string[]>(STORAGE.permissions, []),
  );
  const [permissionsReady, setPermissionsReady] = useState<boolean>(
    () => localStorage.getItem(STORAGE.permissions) !== null,
  );

  const login = useCallback((session: Session) => {
    localStorage.setItem(STORAGE.token, session.accessToken);
    localStorage.setItem(STORAGE.refresh, session.refreshToken);
    localStorage.setItem(STORAGE.memberships, JSON.stringify(session.memberships));
    localStorage.setItem(STORAGE.session, JSON.stringify({ mustReset: session.mustReset }));
    if (session.login) localStorage.setItem(STORAGE.login, session.login);
    else localStorage.removeItem(STORAGE.login);
    // Permissions are per-tenant; clear until a tenant is chosen and they load.
    localStorage.removeItem(STORAGE.permissions);
    setToken(session.accessToken);
    setMemberships(session.memberships);
    setLoginHandle(session.login ?? null);
    setMustReset(session.mustReset);
    setPermsState([]);
    setPermissionsReady(false);
  }, []);

  const setPermissions = useCallback((perms: string[]) => {
    localStorage.setItem(STORAGE.permissions, JSON.stringify(perms));
    setPermsState(perms);
    setPermissionsReady(true);
  }, []);

  const resetPermissions = useCallback(() => {
    localStorage.removeItem(STORAGE.permissions);
    setPermsState([]);
    setPermissionsReady(false);
  }, []);

  const clearMustReset = useCallback(() => {
    localStorage.setItem(STORAGE.session, JSON.stringify({ mustReset: false }));
    setMustReset(false);
  }, []);

  const logout = useCallback(() => {
    [STORAGE.token, STORAGE.refresh, STORAGE.memberships, STORAGE.session, STORAGE.permissions, STORAGE.login].forEach(
      (k) => localStorage.removeItem(k),
    );
    setToken(null);
    setMemberships([]);
    setLoginHandle(null);
    setMustReset(false);
    setPermsState([]);
    setPermissionsReady(false);
  }, []);

  const hasPermission = useCallback(
    (perm?: string) => !perm || permissions.includes('*') || permissions.includes(perm),
    [permissions],
  );

  const value = useMemo<AuthState>(
    () => ({
      token,
      memberships,
      loginHandle,
      mustReset,
      permissions,
      permissionsReady,
      isAuthed: !!token,
      hasPermission,
      login,
      setPermissions,
      resetPermissions,
      clearMustReset,
      logout,
    }),
    [token, memberships, loginHandle, mustReset, permissions, permissionsReady, hasPermission, login, setPermissions, resetPermissions, clearMustReset, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

/** The membership for the active tenant — the single place to read the school name/slug. */
export function useActiveMembership(): Membership | undefined {
  const { memberships } = useAuth();
  const { activeTenantId } = useTenant();
  return memberships.find((m) => m.tenant_id === activeTenantId);
}
