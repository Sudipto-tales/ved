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

// Functional sidebar sections for the admin/staff (EMPLOYEE) experience — ordered to mirror
// the school setup journey (docs/26) so the nav itself teaches the order. The flat "ADMIN"
// list is replaced by these labelled groups; a page's section is derived from its path.
const SECTION_ORDER = [
  'Setup',
  'People',
  'Academics',
  'Finance',
  'Communication',
  'Access & Roles',
  'Reports',
  'Support',
  'More',
] as const;

const SECTION_ICON: Record<string, IconName> = {
  Setup: 'building',
  People: 'users',
  Academics: 'layers',
  Finance: 'wallet',
  Communication: 'bell',
  'Access & Roles': 'shield',
  Reports: 'chart',
  Support: 'help',
  More: 'grid',
};

function sectionFor(path: string): string {
  const seg = path.split('/')[0];
  if (seg === 'admin') return 'Setup';
  if (['students', 'guardians', 'teachers', 'staff', 'onboarding'].includes(seg)) return 'People';
  if (
    [
      'programs', 'program-stages', 'subjects', 'curriculum', 'sections', 'enrollment',
      'teaching-assignments', 'attendance', 'exams', 'marks', 'timetable', 'academics', 'learning',
    ].includes(seg)
  )
    return 'Academics';
  if (
    [
      'fee-heads', 'fee-structures', 'fee-schedules', 'invoices', 'concessions', 'fines',
      'ledger', 'audit-trail', 'collection', 'dues', 'cash-close',
    ].includes(seg)
  )
    return 'Finance';
  if (seg === 'communication') return 'Communication';
  if (seg === 'access') return 'Access & Roles';
  if (seg === 'reports') return 'Reports';
  if (seg === 'support') return 'Support';
  return 'More';
}

const sectionIconFor = (path: string): IconName =>
  ICONS[path.split('/')[0]] ?? SECTION_ICON[sectionFor(path)] ?? 'grid';

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

        {userType === 'EMPLOYEE' ? (
          // Admin/staff: one functional, journey-ordered taxonomy (docs/26) instead of a
          // single flat ADMIN list.
          <>
            <nav className="nav-group">
              <Link to="/" className={`nav-item${loc.pathname === '/' ? ' active' : ''}`}>
                <Icon name="grid" className="nav-icon" />
                Dashboard
              </Link>
            </nav>
            {SECTION_ORDER.map((section) => {
              const items = navPages.filter((p) => allowed.includes(p.persona) && sectionFor(p.path) === section);
              if (items.length === 0) return null;
              return (
                <nav className="nav-group" key={section}>
                  <div className="nav-group-label">{section}</div>
                  {items.map((p) => (
                    <Can key={p.path} permission={p.permission}>
                      <Link to={`/${p.path}`} className={`nav-item${loc.pathname === `/${p.path}` ? ' active' : ''}`}>
                        <Icon name={sectionIconFor(p.path)} className="nav-icon" />
                        {p.title}
                        <span className="tier">{p.tier}</span>
                      </Link>
                    </Can>
                  ))}
                </nav>
              );
            })}
          </>
        ) : (
          // Teacher / Student / Guardian: their own focused single-group portal.
          personasToShow.map((persona) => {
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
          })
        )}

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
