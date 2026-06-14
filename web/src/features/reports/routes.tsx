import type { PageDef } from '@/shared/types/page';

export const reportsPages: PageDef[] = [
  {
    path: 'reports/dashboards',
    title: 'Role-Based Dashboards',
    persona: 'ADMIN',
    tier: 'T1',
    status: 'planned',
    nav: true,
  },
  {
    path: 'reports/exports',
    title: 'Exports',
    persona: 'ADMIN',
    tier: 'T1',
    status: 'planned',
    nav: true,
  },
  {
    path: 'reports/backup-restore',
    title: 'Backup & Restore',
    persona: 'ADMIN',
    permission: 'tenant.settings',
    tier: 'T1',
    status: 'planned',
    nav: true,
  },
];
