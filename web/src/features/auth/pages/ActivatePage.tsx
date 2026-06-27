// Magic-link landing (M11). Two entry shapes, both land here:
//   • Activation:   /activate?token=<one-time-token>  → exchange at POST /auth/activate
//   • Impersonation: /#login-as=<access-token>          → a ready tenant JWT from the
//     control plane's "Login As" (super-admin), carried in the hash so it never hits a server log.
// Either way we end up with an access token, hydrate the session (fetching memberships if the
// token didn't carry them), and route in via the shared post-auth flow.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/shared/ui';
import { useAuth, type Membership } from '@/shared/auth/AuthProvider';
import { api, ApiError } from '@/shared/api/client';
import { STORAGE } from '@/shared/lib/storage';
import { useAuthFlow } from '../useAuthFlow';

interface ActivateResult {
  access_token: string;
  refresh_token?: string;
  must_reset_password?: boolean;
  login?: string;
  memberships?: Membership[];
}

interface MeResult {
  must_reset_password: boolean;
  memberships: Membership[];
}

// Read the impersonation token from the URL hash (#login-as=…), tolerating a leading '#'
// and a '/' before the fragment (the platform opens `${url}/#login-as=…`).
function readImpersonationToken(): string | null {
  const hash = typeof location !== 'undefined' ? location.hash.replace(/^#\/?/, '') : '';
  const params = new URLSearchParams(hash);
  return params.get('login-as');
}

export default function ActivatePage() {
  const { login } = useAuth();
  const continueAfterAuth = useAuthFlow();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard React 18 StrictMode double-invoke
    ran.current = true;

    async function bootstrap(res: ActivateResult) {
      // Store the token first so the api client authorises the memberships call.
      localStorage.setItem(STORAGE.token, res.access_token);
      let memberships = res.memberships;
      let mustReset = res.must_reset_password ?? false;
      if (!memberships) {
        const me = await api.get<MeResult>('/api/v1/me/memberships');
        memberships = me.memberships;
        mustReset = mustReset || me.must_reset_password;
      }
      login({
        accessToken: res.access_token,
        refreshToken: res.refresh_token ?? '',
        mustReset,
        login: res.login,
        memberships,
      });
      continueAfterAuth(memberships, mustReset);
    }

    async function run() {
      const impersonation = readImpersonationToken();
      if (impersonation) {
        await bootstrap({ access_token: impersonation });
        return;
      }
      const token = new URLSearchParams(location.search).get('token');
      if (!token) {
        setError('This activation link is missing its token. Ask for a fresh link.');
        return;
      }
      const res = await api.post<ActivateResult>('/auth/activate', { token });
      await bootstrap(res);
    }

    run().catch((err) => {
      setError(
        err instanceof ApiError && (err.status === 401 || err.status === 410)
          ? 'This link has expired or has already been used. Ask for a fresh one.'
          : 'Could not sign you in from this link. Please try again or sign in manually.',
      );
    });
  }, [login, continueAfterAuth]);

  if (error) {
    return (
      <div>
        <h2 style={{ fontSize: 18 }}>Activation failed</h2>
        <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }} role="alert">{error}</p>
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <Link to="/login">Go to sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-8" style={{ alignItems: 'center' }}>
      <Spinner />
      <span style={{ fontSize: 13 }} className="muted">Signing you in…</span>
    </div>
  );
}
