import type { PageDef } from '@/shared/types/page';

// Auth pages are PUBLIC (rendered under AuthLayout, outside the guard chain). They
// manage their own session checks. M1 builds login + tenant picker + forced reset.
export const authPages: PageDef[] = [
  {
    path: 'login',
    title: 'Sign in',
    persona: 'PUBLIC',
    tier: 'T1',
    status: 'done',
    element: () => import('./pages/LoginPage'),
  },
  {
    path: 'select-tenant',
    title: 'Choose a school',
    persona: 'PUBLIC',
    tier: 'T1',
    status: 'done',
    element: () => import('./pages/SelectTenantPage'),
  },
  {
    path: 'reset-password',
    title: 'Set a new password',
    persona: 'PUBLIC',
    tier: 'T1',
    status: 'done',
    element: () => import('./pages/ResetPasswordPage'),
  },
  {
    path: 'no-access',
    title: 'No access',
    persona: 'PUBLIC',
    tier: 'T1',
    status: 'done',
    element: () => import('./pages/NoAccessPage'),
  },
  // Planned: forgot-password, setup-link landing.
];
