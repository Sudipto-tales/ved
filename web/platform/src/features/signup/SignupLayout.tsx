// Public signup shell — a simple top-bar + centered content on the auth background,
// SEPARATE from the authenticated PlatformShell and outside the AuthGuard. Links to the
// platform sign-in for returning admins.
import { Link, Outlet } from 'react-router-dom';
import { Icon } from '@/shared/ui';

export function SignupLayout() {
  return (
    <div className="auth-wrap" style={{ display: 'block', minHeight: '100vh', overflowY: 'auto' }}>
      <header
        className="flex gap-12"
        style={{ alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px', maxWidth: 960, margin: '0 auto' }}
      >
        <Link to="/signup" className="flex gap-8" style={{ alignItems: 'center', fontWeight: 700, fontSize: 18 }}>
          <span className="brand-badge" style={{ width: 32, height: 32 }}><Icon name="layers" size={16} /></span>
          VED
        </Link>
        <Link to="/login" style={{ fontSize: 13 }}>School admin sign in →</Link>
      </header>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '8px 28px 56px' }}>
        <Outlet />
      </main>
    </div>
  );
}
