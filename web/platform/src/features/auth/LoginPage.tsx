// Platform superadmin login. Dev defaults match the control-plane seed
// (platform.SeedSuperAdmin). Empty in any real deployment.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/shared/ui';
import { ApiError } from '../../shared/api';
import { usePlatformAuth } from '../../shared/auth';

const DEV_EMAIL = import.meta.env.VITE_DEV_PLATFORM_EMAIL ?? 'super@ved.platform';
const DEV_PASSWORD = import.meta.env.VITE_DEV_PLATFORM_PASSWORD ?? 'super1234';

export default function LoginPage() {
  const { login } = usePlatformAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(DEV_EMAIL);
  const [password, setPassword] = useState(DEV_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Incorrect email or password.' : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 style={{ fontSize: 18 }}>Platform sign in</h2>
      <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>Superadmin access to the VED control plane.</p>
      <div className="mt-16">
        <label className="label" htmlFor="pe">Email</label>
        <input id="pe" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
      </div>
      <div className="mt-16">
        <label className="label" htmlFor="pp">Password</label>
        <input id="pp" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }} role="alert">{error}</p>}
      <div className="mt-16">
        <Button type="submit" disabled={busy || !email.trim() || !password} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>
      <p className="subtle" style={{ fontSize: 12, marginTop: 14, textAlign: 'center' }}>
        New school? <Link to="/signup">Register here</Link>
      </p>
    </form>
  );
}
