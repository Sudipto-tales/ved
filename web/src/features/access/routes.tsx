import type { PageDef } from '@/shared/types/page';

export const accessPages: PageDef[] = [
  {
    path: 'access/roles',
    title: 'Roles & Permissions',
    persona: 'ADMIN',
    permission: 'role.manage',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./pages/RolesPage'),
  },
  {
    path: 'access/designations',
    title: 'Designations',
    persona: 'ADMIN',
    permission: 'designation.manage',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./pages/DesignationsPage'),
  },
  {
    path: 'access/user-roles',
    title: 'Assign Roles to Users',
    persona: 'ADMIN',
    permission: 'user.assign_roles',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./pages/UserRolesPage'),
  },
  {
    path: 'access/maker-checker',
    title: 'Maker-Checker Config',
    persona: 'ADMIN',
    permission: 'role.manage',
    tier: 'T2',
    status: 'done',
    nav: true,
    element: () => import('./pages/MakerCheckerPage'),
  },
];
