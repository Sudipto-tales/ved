// Authenticated control-plane shell — reuses the tenant design system's CSS classes
// (shell/sidebar/nav-item) for a consistent look, but its own nav + sign-out.
// Adds a collapsible icon-rail sidebar and a sticky utility topbar (search, language,
// notifications, contacts, settings, profile).
import { useState } from 'react';
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

const COLLAPSE_KEY = 'ved.platform.navCollapsed';

export function PlatformShell() {
  const { logout } = usePlatformAuth();
  const loc = useLocation();
  const nav = platformPages.filter((p) => p.nav);

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  };

  return (
    <div className={`shell${collapsed ? ' nav-collapsed' : ''}`}>
      <aside className="sidebar">
        <Link to="/" className="brand" title="VED Platform">
          <span className="brand-badge"><Icon name="layers" size={16} /></span>
          {!collapsed && 'VED Platform'}
        </Link>
        {!collapsed && (
          <div className="subtle" style={{ fontSize: 11, padding: '2px 8px 0' }}>control plane</div>
        )}

        <nav className="nav-group">
          {!collapsed && <div className="nav-group-label">SUPERADMIN</div>}
          {nav.map((p) => {
            const active = loc.pathname === `/${p.path}`;
            return (
              <Link
                key={p.path}
                to={`/${p.path}`}
                className={`nav-item${active ? ' active' : ''}`}
                title={collapsed ? p.title : undefined}
              >
                <Icon name={iconFor(p.path)} className="nav-icon" />
                {!collapsed && (
                  <>
                    {p.title}
                    <span className="tier">{p.tier}</span>
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="spacer" />
        <button className="nav-item" onClick={logout} title={collapsed ? 'Sign out' : undefined}>
          <Icon name="arrow-left" className="nav-icon" />
          {!collapsed && 'Sign out'}
        </button>
      </aside>

      <div className="content">
        <header className="topbar">
          <button className="icon-btn" onClick={toggleCollapsed} aria-label="Toggle sidebar" title="Toggle sidebar">
            <Icon name="menu" />
          </button>

          <label className="topbar-search">
            <Icon name="search" size={16} />
            <input placeholder="Search…" aria-label="Search" />
            <span className="kbd">⌘K</span>
          </label>

          <div className="spacer" />

          <button className="icon-btn" aria-label="Language" title="Language">
            <Icon name="globe" />
          </button>
          <button className="icon-btn" aria-label="Notifications" title="Notifications">
            <Icon name="bell" />
            <span className="icon-badge">4</span>
          </button>
          <button className="icon-btn" aria-label="Contacts" title="Contacts">
            <Icon name="users" />
          </button>
          <button className="icon-btn" aria-label="Settings" title="Settings">
            <Icon name="settings" />
          </button>
          <button className="avatar" aria-label="Account" title="Superadmin">SA</button>
        </header>

        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
