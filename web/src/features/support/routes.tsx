import type { PageDef } from '@/shared/types/page';

// School-side support — available to admins (no special permission). The list is in the
// sidebar; the ticket thread is reached by clicking a row.
export const supportPages: PageDef[] = [
  {
    path: 'support',
    title: 'Support',
    persona: 'ADMIN',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./pages/SupportListPage'),
  },
  {
    path: 'support/:id',
    title: 'Support request',
    persona: 'ADMIN',
    tier: 'T1',
    status: 'done',
    nav: false,
    element: () => import('./pages/SupportTicketPage'),
  },
];
