import type { PageDef } from '@/shared/types/page';

export const onboardingPages: PageDef[] = [
  // --- STAFF / ADMIN: shared onboarding engine UI ---
  {
    path: 'onboarding',
    title: 'Onboarding',
    persona: 'STAFF',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./pages/OnboardingHubPage'),
  },
  {
    path: 'onboarding/approvals',
    title: 'Pending approvals',
    persona: 'STAFF',
    permission: 'onboarding.approve',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./pages/ApprovalsPage'),
  },
];
