// Typed hooks for the admin (tenant-setup) slice. Most tenant-setup tables don't exist
// yet, so these screens are polished scaffolds with local state. The two that DO have a
// read endpoint (school profile + academic years, served read-only by the access slice
// under tenant.settings) are wired here. Query keys are local per this file.
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export interface TenantProfile {
  id: string;
  display_name: string;
  slug: string;
  institution_type: string;
}

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export const adminKeys = {
  profile: ['admin', 'profile'] as const,
  academicYears: ['admin', 'academic-years'] as const,
};

export function useTenantProfile() {
  return useQuery({
    queryKey: adminKeys.profile,
    queryFn: () => api.get<TenantProfile>('/api/v1/access/profile'),
  });
}

export function useAcademicYears() {
  return useQuery({
    queryKey: adminKeys.academicYears,
    queryFn: () => api.get<{ academic_years: AcademicYear[] }>('/api/v1/access/academic-years'),
  });
}
