// Typed hooks for the staff slice (M5) — thin wrappers over the shared api client,
// mirroring the backend contract (internal/features/staff).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/queryKeys';

export interface OnboardInput {
  name: string;
  department?: string;
  designation?: string;
  joining_date?: string;
  employee_code?: string;
}

export interface OnboardResult {
  employee_id: string;
  membership_id: string;
  login_identifier: string;
  temp_password: string;
}

export interface StaffRow {
  id: string;
  name: string;
  login_identifier: string;
  status: string;
  department?: string;
  designation?: string;
  created_at: string;
}

export interface StaffDetail extends StaffRow {
  employee_code?: string;
  joining_date?: string;
}

export function useStaff() {
  return useQuery({
    queryKey: queryKeys.staff,
    queryFn: () => api.get<{ staff: StaffRow[] }>('/api/v1/staff'),
  });
}

export function useStaffMember(id: string) {
  return useQuery({
    queryKey: [...queryKeys.staff, id],
    queryFn: () => api.get<StaffDetail>(`/api/v1/staff/${id}`),
    enabled: !!id,
  });
}

export function useOnboardStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OnboardInput) => api.post<OnboardResult>('/api/v1/staff/onboard', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff }),
  });
}
