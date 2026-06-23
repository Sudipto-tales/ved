// Authenticated control-plane shell — reuses the tenant design system's CSS classes
// (shell/sidebar/nav-item) for a consistent look, but its own nav + sign-out.
// Adds a collapsible icon-rail sidebar and a sticky utility topbar (search, language,
// notifications, contacts, settings, profile).
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon, VedLogo, type IconName } from '@/shared/ui';
import { platformPages } from '../routes';
import { usePlatformAuth } from '../shared/auth';

const ICONS: Record<string, IconName> = {
  dashboard: 'grid',
  registrations: 'user-plus',
  'payment-proofs': 'wallet',
  tenants: 'building',
  subscriptions: 'layers',
  plans: 'note',
  licenses: 'shield',
  analytics: 'chart',
  support: 'help',
  releases: 'graduation',
  settings: 'settings',
};
const iconFor = (path: string): IconName => ICONS[path.split('/')[0]] ?? 'grid';

// Grouped sidebar (docs/promts.md "Optimized Super Admin Sidebar"). Ordered sections;
// each lists the page paths it owns. Pages not present/nav are silently skipped.
const SECTIONS: { label?: string; paths: string[] }[] = [
  { paths: ['dashboard'] },
  { label: 'TENANTS', paths: ['registrations', 'tenants', 'payment-proofs'] },
  { label: 'BILLING', paths: ['subscriptions', 'licenses'] },
  { label: 'SYSTEM', paths: ['releases', 'settings', 'support'] },
];

const COLLAPSE_KEY = 'ved.platform.navCollapsed';

export function PlatformShell() {
  const { logout } = usePlatformAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const nav = platformPages.filter((p) => p.nav);

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  };

  // Topbar dropdown menus (profile / language). Close on outside click or Escape.
  const [menu, setMenu] = useState<null | 'profile' | 'lang'>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  const go = (path: string) => {
    setMenu(null);
    navigate(path);
  };

  return (
    <div className={`shell${collapsed ? ' nav-collapsed' : ''}`}>
      <aside className="sidebar">
        <Link to="/" className="brand" title="VED Platform">
          <VedLogo size={28} />
          {!collapsed && 'VED Platform'}
        </Link>
        {!collapsed && (
          <div className="subtle" style={{ fontSize: 11, padding: '2px 8px 0' }}>control plane</div>
        )}

        {SECTIONS.map((section, si) => {
          const items = section.paths
            .map((path) => nav.find((p) => p.path === path))
            .filter((p): p is (typeof nav)[number] => Boolean(p));
          if (items.length === 0) return null;
          return (
            <nav className="nav-group" key={si}>
              {!collapsed && section.label && <div className="nav-group-label">{section.label}</div>}
              {items.map((p) => {
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
          );
        })}

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

          <div className="flex gap-8" ref={actionsRef} style={{ alignItems: 'center', position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <button
                className="icon-btn"
                aria-label="Language"
                title="Language"
                onClick={() => setMenu((m) => (m === 'lang' ? null : 'lang'))}
              >
                <Icon name="globe" />
              </button>
              {menu === 'lang' && (
                <div className="menu" role="menu">
                  <button className="menu-item active" role="menuitem" onClick={() => setMenu(null)}>
                    <Icon name="globe" /> English
                  </button>
                  <button className="menu-item" role="menuitem" onClick={() => setMenu(null)}>
                    हिन्दी (Hindi)
                  </button>
                </div>
              )}
            </div>

            <button className="icon-btn" aria-label="Notifications" title="Pending registrations" onClick={() => go('/registrations')}>
              <Icon name="bell" />
            </button>
            <button className="icon-btn" aria-label="Tenants" title="Tenants" onClick={() => go('/tenants')}>
              <Icon name="users" />
            </button>
            <button className="icon-btn" aria-label="Settings" title="Settings" onClick={() => go('/settings')}>
              <Icon name="settings" />
            </button>

            <div style={{ position: 'relative' }}>
              <button
                className="avatar"
                aria-label="Account"
                title="Account"
                onClick={() => setMenu((m) => (m === 'profile' ? null : 'profile'))}
              >
                SA
              </button>
              {menu === 'profile' && (
                <div className="menu" role="menu">
                  <div className="menu-head">
                    <b>Superadmin</b>
                    <span>super@ved.platform</span>
                  </div>
                  <div className="menu-sep" />
                  <button className="menu-item" role="menuitem" onClick={() => go('/settings')}>
                    <Icon name="settings" /> Settings
                  </button>
                  <button className="menu-item" role="menuitem" onClick={() => go('/releases')}>
                    <Icon name="graduation" /> App Releases
                  </button>
                  <div className="menu-sep" />
                  <button className="menu-item" role="menuitem" onClick={() => { setMenu(null); logout(); }}>
                    <Icon name="arrow-left" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
