import type { PageDef } from '@/shared/types/page';

// Help pages are available to every authenticated persona (no permission gate). They
// live inside the app shell. nav:false — Help is reached via the sidebar footer link
// and the contextual “?” affordances, not the persona nav groups.
export const helpPages: PageDef[] = [
  {
    path: 'help',
    title: 'Help',
    persona: 'ADMIN',
    tier: 'T1',
    status: 'done',
    nav: false,
    element: () => import('./pages/HelpIndexPage'),
  },
  {
    path: 'help/:slug',
    title: 'Help topic',
    persona: 'ADMIN',
    tier: 'T1',
    status: 'done',
    nav: false,
    element: () => import('./pages/HelpTopicPage'),
  },
];
