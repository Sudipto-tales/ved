// Layout for unauthenticated pages — a softly floating card centered on a muted,
// faintly tinted backdrop.
import { Outlet } from 'react-router-dom';
import { Icon } from '@/shared/ui';

export function AuthLayout() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="flex gap-12" style={{ justifyContent: 'center', marginBottom: 18 }}>
          <span className="brand-badge" style={{ width: 36, height: 36 }}>
            <Icon name="layers" size={18} />
          </span>
          <span style={{ fontSize: 22, fontWeight: 700 }}>VED</span>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
