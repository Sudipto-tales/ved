import type { PageDef } from '@/shared/types/page';

export const staffPages: PageDef[] = [
  // --- ADMIN / STAFF: People → Staff / Authority management ---
  {
    path: 'staff',
    title: 'Staff',
    persona: 'ADMIN',
    permission: 'staff.read',
    tier: 'T1',
    status: 'planned',
    nav: true,
  },
  {
    path: 'staff/:id',
    title: 'Staff detail',
    persona: 'ADMIN',
    permission: 'staff.read',
    tier: 'T1',
    status: 'planned',
  },
  {
    path: 'staff/onboard',
    title: 'Onboard staff',
    persona: 'ADMIN',
    permission: 'staff.onboard',
    tier: 'T1',
    status: 'planned',
  },
];
