// The aggregator: every feature's PageDef manifest collected into one list. This is
// what makes routing data-driven — add a page to a feature's routes.tsx and it shows
// up in the router and sidebar automatically. (docs/22-frontend.md)
import type { PageDef } from '@/shared/types/page';

import { authPages } from '@/features/auth/routes';
import { studentsPages } from '@/features/students/routes';
import { teachersPages } from '@/features/teachers/routes';
import { staffPages } from '@/features/staff/routes';
import { onboardingPages } from '@/features/onboarding/routes';
import { guardiansPages } from '@/features/guardians/routes';
import { academicsPages } from '@/features/academics/routes';
import { financePages } from '@/features/finance/routes';
import { learningPages } from '@/features/learning/routes';
import { accessPages } from '@/features/access/routes';
import { adminPages } from '@/features/admin/routes';
import { communicationPages } from '@/features/communication/routes';
import { reportsPages } from '@/features/reports/routes';
import { helpPages } from '@/features/help/routes';

export const allPages: PageDef[] = [
  ...authPages,
  ...helpPages,
  ...studentsPages,
  ...teachersPages,
  ...staffPages,
  ...onboardingPages,
  ...guardiansPages,
  ...academicsPages,
  ...financePages,
  ...learningPages,
  ...accessPages,
  ...adminPages,
  ...communicationPages,
  ...reportsPages,
];

export const publicPages = allPages.filter((p) => p.persona === 'PUBLIC');
export const protectedPages = allPages.filter((p) => p.persona !== 'PUBLIC');
