// Real M1 login. Submits credentials to /auth/login, stores the session, then routes
// via the shared post-auth flow (forced reset → tenant picker → app).
import { useState, type FormEvent } from 'react';
import { Button } from '@/shared/ui';
import { useAuth } from '@/shared/auth/AuthProvider';
import { useTenant } from '@/shared/tenant/TenantProvider';
import { ApiError } from '@/shared/api/client';
import { login as loginRequest } from '../api/authApi';
import { useAuthFlow } from '../useAuthFlow';

// Dev defaults match the backend dev seed (identity.SeedDevAdmin) so a fresh stack
// can be signed into immediately. Empty in any real deployment.
const DEV_LOGIN = import.meta.env.VITE_DEV_LOGIN ?? 'admin@ved.local';
const DEV_PASSWORD = import.meta.env.VITE_DEV_PASSWORD ?? 'admin1234';

export default function LoginPage() {
  const { login } = useAuth();
  const { tenantSlug } = useTenant();
  const continueAfterAuth = useAuthFlow();
  const [identifier, setIdentifier] = useState(DEV_LOGIN);
  const [password, setPassword] = useState(DEV_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await loginRequest(identifier.trim(), password);
      login({
        accessToken: res.access_token,
        refreshToken: res.refresh_token,
        mustReset: res.must_reset_password,
        login: res.login ?? identifier.trim(),
        memberships: res.memberships,
      });
      continueAfterAuth(res.memberships, res.must_reset_password);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Incorrect email or password.'
          : 'Could not sign in. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 style={{ fontSize: 18 }}>Sign in</h2>
      <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        {tenantSlug
          ? <>Signing in to <strong style={{ color: 'var(--text)' }}>{tenantSlug}</strong>.</>
          : 'Welcome back. Enter your VED credentials to continue.'}
      </p>

      <div className="mt-16">
        <label className="label" htmlFor="login-id">Email or username</label>
        <input
          id="login-id"
          className="input"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="you@school.com"
        />
      </div>

      <div className="mt-16">
        <label className="label" htmlFor="login-pw">Password</label>
        <input
          id="login-pw"
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }} role="alert">
          {error}
        </p>
      )}

      <div className="mt-16">
        <Button type="submit" disabled={busy || !identifier.trim() || !password} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>
    </form>
  );
}
