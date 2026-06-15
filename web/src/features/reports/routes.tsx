import type { PageDef } from '@/shared/types/page';

export const reportsPages: PageDef[] = [
  {
    path: 'reports/dashboards',
    title: 'Role-Based Dashboards',
    persona: 'ADMIN',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./pages/DashboardsPage'),
  },
  {
    path: 'reports/exports',
    title: 'Exports',
    persona: 'ADMIN',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./pages/ExportsPage'),
  },
  {
    path: 'reports/backup-restore',
    title: 'Backup & Restore',
    persona: 'ADMIN',
    permission: 'tenant.settings',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./pages/BackupRestorePage'),
  },
];
