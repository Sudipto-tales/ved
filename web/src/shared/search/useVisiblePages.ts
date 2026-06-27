// useVisiblePages — the page-navigation source for the command palette. It applies the
// SAME gate the sidebar (AppShell) uses, so the palette can only ever offer pages the
// user is allowed to open: membership user_type → allowed personas, then per-page
// permission via hasPermission. Keeping this gate in one hook means search visibility
// never drifts from nav visibility.
import { useMemo } from 'react';
import { protectedPages } from '@/app/pages';
import type { Persona } from '@/shared/types/page';
import { useAuth } from '@/shared/auth/AuthProvider';
import { useTenant } from '@/shared/tenant/TenantProvider';
import type { IconName } from '@/shared/ui';
import type { CommandItem } from './command';

const PERSONAS_FOR: Record<string, Persona[]> = {
  EMPLOYEE: ['ADMIN', 'STAFF'],
  TEACHER: ['TEACHER'],
  STUDENT: ['STUDENT'],
  GUARDIAN: ['GUARDIAN'],
};

// Mirror AppShell's first-segment → icon map (kept here so palette rows are icon-led).
const ICONS: Record<string, IconName> = {
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

export function useVisiblePages(): CommandItem[] {
  const { memberships, hasPermission } = useAuth();
  const { activeTenantId } = useTenant();

  return useMemo(() => {
    const userType = memberships.find((m) => m.tenant_id === activeTenantId)?.user_type ?? 'EMPLOYEE';
    const allowed = PERSONAS_FOR[userType] ?? ['ADMIN', 'STAFF'];
    return protectedPages
      .filter((p) => p.nav && p.status === 'done' && !p.path.includes(':'))
      .filter((p) => allowed.includes(p.persona))
      .filter((p) => hasPermission(p.permission))
      .map<CommandItem>((p) => ({
        id: `page:${p.path}`,
        type: 'page',
        label: p.title,
        url: `/${p.path}`,
        group: 'Pages',
        icon: iconFor(p.path),
      }));
  }, [memberships, activeTenantId, hasPermission]);
}
