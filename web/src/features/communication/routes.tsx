import type { PageDef } from '@/shared/types/page';

export const communicationPages: PageDef[] = [
  {
    path: 'communication/notices',
    title: 'Notices & Announcements',
    persona: 'ADMIN',
    tier: 'T2',
    status: 'done',
    nav: true,
    element: () => import('./pages/NoticesPage'),
  },
  {
    path: 'communication/notifications',
    title: 'Notification Center',
    persona: 'ADMIN',
    tier: 'T2',
    status: 'done',
    nav: true,
    element: () => import('./pages/NotificationsPage'),
  },
];
