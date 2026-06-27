// Auth/session state for the app: a persisted { serverUrl, slug, token } in the device's
// secure store. Mirrors the web auth provider but mobile-shaped (no cookies; a stored JWT).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { login as apiLogin, type Session } from '@/api/client';

const STORE_KEY = 'ved.session';

type AuthState = {
  session: Session | null;
  loading: boolean;
  signIn: (serverUrl: string, slug: string, loginIdentifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore a persisted session on launch.
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORE_KEY);
        if (raw) setSession(JSON.parse(raw));
      } catch {
        // ignore — treat as logged out
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(
    async (serverUrl: string, slug: string, loginIdentifier: string, password: string) => {
      const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
      const cleanSlug = slug.trim().toLowerCase();
      const { access_token } = await apiLogin(cleanUrl, loginIdentifier.trim(), password);
      const next: Session = { serverUrl: cleanUrl, slug: cleanSlug, token: access_token };
      await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(next));
      setSession(next);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(STORE_KEY);
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, loading, signIn, signOut }), [session, loading, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
