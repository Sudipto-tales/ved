// Authenticated shell — Premium SaaS Minimalism: a clean white sidebar with grouped,
// icon-led nav (active item gets the accent tint), a spacious content area on a muted
// background. Nav is built from the aggregated PageDefs; gated items hidden via <Can>.
import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { protectedPages } from '@/app/pages';
import type { Persona } from '@/shared/types/page';
import { useAuth } from '@/shared/auth/AuthProvider';
import { useSyncPermissions } from '@/shared/auth/useSyncPermissions';
import { useTenant } from '@/shared/tenant/TenantProvider';
import { Can } from '@/shared/authz/Can';
import { Icon, useCommandHotkey, type IconName } from '@/shared/ui';
import { AppCommandPalette } from '@/shared/search/AppCommandPalette';

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
  support: 'help',
};
const iconFor = (path: string): IconName => ICONS[path.split('/')[0]] ?? 'grid';

// A user's membership user_type decides which persona experience they see — an EMPLOYEE
// gets the management UI (ADMIN + STAFF groups, further gated by permission); a TEACHER /
// STUDENT / GUARDIAN gets only their own portal. Without this, permission-less portal
// pages would leak into every user's sidebar.
const PERSONAS_FOR: Record<string, Persona[]> = {
  EMPLOYEE: ['ADMIN', 'STAFF'],
  TEACHER: ['TEACHER'],
  STUDENT: ['STUDENT'],
  GUARDIAN: ['GUARDIAN'],
};

export function AppShell() {
  const { logout, memberships } = useAuth();
  const { activeTenantId, clearTenant } = useTenant();
  useSyncPermissions(); // load effective permissions for the active tenant (M2)
  const loc = useLocation();
  const navPages = protectedPages.filter((p) => p.nav);

  const [searchOpen, setSearchOpen] = useState(false);
  useCommandHotkey(() => setSearchOpen(true));

  const userType = memberships.find((m) => m.tenant_id === activeTenantId)?.user_type ?? 'EMPLOYEE';
  const allowed = PERSONAS_FOR[userType] ?? ['ADMIN', 'STAFF'];
  const personasToShow = PERSONA_ORDER.filter((p) => allowed.includes(p));

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

        {personasToShow.map((persona) => {
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

      <div className="content">
        <header className="topbar">
          <button
            type="button"
            className="topbar-search"
            onClick={() => setSearchOpen(true)}
            aria-label="Search (Cmd/Ctrl+K)"
          >
            <Icon name="search" size={16} />
            <span className="ts-placeholder">Search…</span>
            <span className="kbd">⌘K</span>
          </button>
          <div className="spacer" />
        </header>

        <main className="main">
          <Outlet />
        </main>
      </div>

      <AppCommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
