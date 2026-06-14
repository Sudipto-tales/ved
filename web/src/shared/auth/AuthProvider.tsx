// Auth seam (plan/bridges.md §2). Holds the session (access + refresh tokens, the
// user's memberships, the must-reset flag) and the effective permission set, and
// exposes login/logout. M1 wires real JWT issuance: `login` stores what the backend
// /auth/login returned. Permissions stay wildcard until RBAC lands (M2), so the
// cosmetic <Can> gate shows everything for now — the server is authoritative.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { STORAGE } from '@/shared/lib/storage';

export interface Membership {
  membership_id: string;
  tenant_id: string;
  user_type: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  mustReset: boolean;
  memberships: Membership[];
}

interface AuthState {
  token: string | null;
  memberships: Membership[];
  mustReset: boolean;
  permissions: string[];
  isAuthed: boolean;
  hasPermission: (perm?: string) => boolean;
  login: (session: Session) => void;
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

// M1: every authenticated user gets the wildcard permission until M2 seeds the
// real catalog. Centralised here so the switch to real perms is one line.
const M1_PERMISSIONS = ['*'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE.token));
  const [memberships, setMemberships] = useState<Membership[]>(() =>
    readJSON<Membership[]>(STORAGE.memberships, []),
  );
  const [mustReset, setMustReset] = useState<boolean>(
    () => readJSON<{ mustReset?: boolean }>(STORAGE.session, {}).mustReset ?? false,
  );

  const login = useCallback((session: Session) => {
    localStorage.setItem(STORAGE.token, session.accessToken);
    localStorage.setItem(STORAGE.refresh, session.refreshToken);
    localStorage.setItem(STORAGE.memberships, JSON.stringify(session.memberships));
    localStorage.setItem(STORAGE.session, JSON.stringify({ mustReset: session.mustReset }));
    localStorage.setItem(STORAGE.permissions, JSON.stringify(M1_PERMISSIONS));
    setToken(session.accessToken);
    setMemberships(session.memberships);
    setMustReset(session.mustReset);
  }, []);

  const clearMustReset = useCallback(() => {
    localStorage.setItem(STORAGE.session, JSON.stringify({ mustReset: false }));
    setMustReset(false);
  }, []);

  const logout = useCallback(() => {
    [STORAGE.token, STORAGE.refresh, STORAGE.memberships, STORAGE.session, STORAGE.permissions].forEach(
      (k) => localStorage.removeItem(k),
    );
    setToken(null);
    setMemberships([]);
    setMustReset(false);
  }, []);

  const hasPermission = useCallback(
    (perm?: string) => !perm || M1_PERMISSIONS.includes('*') || M1_PERMISSIONS.includes(perm),
    [],
  );

  const value = useMemo<AuthState>(
    () => ({
      token,
      memberships,
      mustReset,
      permissions: M1_PERMISSIONS,
      isAuthed: !!token,
      hasPermission,
      login,
      clearMustReset,
      logout,
    }),
    [token, memberships, mustReset, hasPermission, login, clearMustReset, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
