// Forced-on-first-login (or voluntary) password reset. Proves the current password,
// sets a new one, clears the must-reset gate, then continues into the app.
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/shared/ui';
import { useAuth } from '@/shared/auth/AuthProvider';
import { ApiError } from '@/shared/api/client';
import { resetPassword } from '../api/authApi';
import { useAuthFlow } from '../useAuthFlow';

export default function ResetPasswordPage() {
  const { isAuthed, memberships, clearMustReset } = useAuth();
  const continueAfterAuth = useAuthFlow();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isAuthed) return <Navigate to="/login" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== confirm) return setError('New passwords do not match.');
    setBusy(true);
    try {
      await resetPassword(current, next);
      clearMustReset();
      continueAfterAuth(memberships, false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Your current password is incorrect.'
          : 'Could not update your password. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 style={{ fontSize: 18 }}>Set a new password</h2>
      <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        For your security, choose a new password before continuing.
      </p>

      <div className="mt-16">
        <label className="label" htmlFor="cur-pw">Current password</label>
        <input id="cur-pw" className="input" type="password" autoComplete="current-password"
          value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="mt-16">
        <label className="label" htmlFor="new-pw">New password</label>
        <input id="new-pw" className="input" type="password" autoComplete="new-password"
          value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div className="mt-16">
        <label className="label" htmlFor="conf-pw">Confirm new password</label>
        <input id="conf-pw" className="input" type="password" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }} role="alert">{error}</p>
      )}

      <div className="mt-16">
        <Button type="submit" disabled={busy || !current || !next || !confirm} style={{ width: '100%' }}>
          {busy ? 'Updating…' : 'Update password & continue'}
        </Button>
      </div>
    </form>
  );
}
