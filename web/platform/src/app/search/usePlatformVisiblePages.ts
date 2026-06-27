// usePlatformVisiblePages — page-navigation source for the platform command palette.
// Gated by the platform permission check (today superadmin sees all; forward-compatible
// with granular platform roles). Mirrors PlatformShell's nav gating.
import { useMemo } from 'react';
import type { IconName } from '@/shared/ui';
import type { CommandItem } from '@/shared/search/command';
import { platformPages } from '../../routes';
import { usePlatformAuth } from '../../shared/auth';

const ICONS: Record<string, IconName> = {
  dashboard: 'grid',
  registrations: 'user-plus',
  'payment-proofs': 'wallet',
  tenants: 'building',
  subscriptions: 'layers',
  plans: 'note',
  licenses: 'shield',
  support: 'help',
  releases: 'graduation',
  settings: 'settings',
};
const iconFor = (path: string): IconName => ICONS[path.split('/')[0]] ?? 'grid';

export function usePlatformVisiblePages(): CommandItem[] {
  const { hasPermission } = usePlatformAuth();
  return useMemo(
    () =>
      platformPages
        .filter((p) => p.nav && p.status === 'done' && !p.path.includes(':'))
        .filter((p) => hasPermission(p.permission))
        .map<CommandItem>((p) => ({
          id: `page:${p.path}`,
          type: 'page',
          label: p.title,
          url: `/${p.path}`,
          group: 'Pages',
          icon: iconFor(p.path),
        })),
    [hasPermission],
  );
}
