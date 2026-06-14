import type { PageDef } from '@/shared/types/page';

export const onboardingPages: PageDef[] = [
  // --- STAFF / ADMIN: shared onboarding engine UI ---
  {
    path: 'onboarding',
    title: 'Onboarding',
    persona: 'STAFF',
    tier: 'T1',
    status: 'planned',
    nav: true,
  },
  {
    path: 'onboarding/approvals',
    title: 'Pending approvals',
    persona: 'STAFF',
    permission: 'onboarding.approve',
    tier: 'T1',
    status: 'planned',
    nav: true,
  },
];
