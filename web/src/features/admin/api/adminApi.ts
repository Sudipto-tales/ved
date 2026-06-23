// Typed hooks for the admin (tenant-setup) slice. Most tenant-setup tables don't exist
// yet, so these screens are polished scaffolds with local state. The two that DO have a
// read endpoint (school profile + academic years, served read-only by the access slice
// under tenant.settings) are wired here. Query keys are local per this file.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

// ── Dynamic onboarding template + dropdowns (M10) ────────────────────────────
export type PersonType = 'STUDENT' | 'TEACHER' | 'EMPLOYEE';

export interface FieldConfig {
  field_key: string;
  label: string;
  visible: boolean;
  required: boolean;
  ordinal: number;
  dropdown_category?: string;
}

export interface DropdownOption {
  id: string;
  category: string;
  label: string;
  value: string;
  ordinal: number;
  active: boolean;
}

export const onboardingKeys = {
  template: (t: string) => ['admin', 'onboarding-template', t] as const,
  dropdowns: ['admin', 'dropdowns'] as const,
};

export function useOnboardingTemplate(personType: PersonType) {
  return useQuery({
    queryKey: onboardingKeys.template(personType),
    queryFn: () => api.get<{ fields: FieldConfig[] }>(`/api/v1/access/onboarding-template/${personType}`),
  });
}

export function useSaveOnboardingTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ personType, fields }: { personType: PersonType; fields: FieldConfig[] }) =>
      api.put<void>(`/api/v1/access/onboarding-template/${personType}`, { fields }),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: onboardingKeys.template(v.personType) }),
  });
}

export function useDropdowns() {
  return useQuery({
    queryKey: onboardingKeys.dropdowns,
    queryFn: () => api.get<{ options: DropdownOption[] }>('/api/v1/access/dropdowns'),
  });
}

export function useUpsertDropdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (o: Partial<DropdownOption> & { category: string; label: string; value: string }) =>
      api.post<{ id: string }>('/api/v1/access/dropdowns', o),
    onSuccess: () => qc.invalidateQueries({ queryKey: onboardingKeys.dropdowns }),
  });
}

export function useDeleteDropdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/api/v1/access/dropdowns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: onboardingKeys.dropdowns }),
  });
}
