// Authenticated shell — Premium SaaS Minimalism: a clean white sidebar with grouped,
// icon-led nav (active item gets the accent tint), a spacious content area on a muted
// background. Nav is built from the aggregated PageDefs; gated items hidden via <Can>.
import { Link, Outlet, useLocation } from 'react-router-dom';
import { protectedPages } from '@/app/pages';
import type { Persona } from '@/shared/types/page';
import { useAuth } from '@/shared/auth/AuthProvider';
import { useTenant } from '@/shared/tenant/TenantProvider';
import { Can } from '@/shared/authz/Can';
import { Icon, type IconName } from '@/shared/ui';

const PERSONA_ORDER: Persona[] = ['ADMIN', 'STAFF', 'TEACHER', 'STUDENT', 'GUARDIAN'];

// Map a route's first segment to a thin-line icon.
const ICONS: Record<string, IconName> = {
  notes: 'note',
  students: 'users',
  teachers: 'graduation',
  staff: 'users',
  onboarding: 'user-plus',
  guardians: 'shield',
  academics: 'layers',
  finance: 'wallet',
  access: 'shield',
  admin: 'building',
  communication: 'bell',
  reports: 'chart',
  learning: 'book',
};
const iconFor = (path: string): IconName => ICONS[path.split('/')[0]] ?? 'grid';

export function AppShell() {
  const { logout } = useAuth();
  const { activeTenantId, clearTenant } = useTenant();
  const loc = useLocation();
  const navPages = protectedPages.filter((p) => p.nav);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-badge">
            <Icon name="layers" size={16} />
          </span>
          VED
        </Link>
        <div className="subtle" style={{ fontSize: 11, padding: '2px 8px 0' }}>
          tenant {activeTenantId?.slice(0, 8)}…
        </div>

        {PERSONA_ORDER.map((persona) => {
          const items = navPages.filter((p) => p.persona === persona);
          if (items.length === 0) return null;
          return (
            <nav className="nav-group" key={persona}>
              <div className="nav-group-label">{persona}</div>
              {items.map((p) => (
                <Can key={p.path} permission={p.permission}>
                  <Link to={`/${p.path}`} className={`nav-item${loc.pathname === `/${p.path}` ? ' active' : ''}`}>
                    <Icon name={iconFor(p.path)} className="nav-icon" />
                    {p.title}
                    <span className="tier">{p.tier}</span>
                  </Link>
                </Can>
              ))}
            </nav>
          );
        })}

        <div className="spacer" />
        <Link to="/help" className={`nav-item${loc.pathname.startsWith('/help') ? ' active' : ''}`}>
          <Icon name="help" className="nav-icon" />
          Help &amp; guidance
        </Link>
        <button
          className="nav-item"
          onClick={() => {
            clearTenant();
            logout();
          }}
        >
          Sign out
        </button>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
