// Authenticated control-plane shell — reuses the tenant design system's CSS classes
// (shell/sidebar/nav-item) for a consistent look, but its own nav + sign-out.
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '@/shared/ui';
import { platformPages } from '../routes';
import { usePlatformAuth } from '../shared/auth';

const ICONS: Record<string, IconName> = {
  dashboard: 'grid',
  registrations: 'user-plus',
  'payment-proofs': 'wallet',
  tenants: 'building',
  subscriptions: 'layers',
  licenses: 'shield',
  analytics: 'chart',
  support: 'help',
};
const iconFor = (path: string): IconName => ICONS[path.split('/')[0]] ?? 'grid';

export function PlatformShell() {
  const { logout } = usePlatformAuth();
  const loc = useLocation();
  const nav = platformPages.filter((p) => p.nav);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-badge"><Icon name="layers" size={16} /></span>
          VED Platform
        </Link>
        <div className="subtle" style={{ fontSize: 11, padding: '2px 8px 0' }}>control plane</div>

        <nav className="nav-group">
          <div className="nav-group-label">SUPERADMIN</div>
          {nav.map((p) => (
            <Link key={p.path} to={`/${p.path}`} className={`nav-item${loc.pathname === `/${p.path}` ? ' active' : ''}`}>
              <Icon name={iconFor(p.path)} className="nav-icon" />
              {p.title}
              <span className="tier">{p.tier}</span>
            </Link>
          ))}
        </nav>

        <div className="spacer" />
        <button className="nav-item" onClick={logout}>Sign out</button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
