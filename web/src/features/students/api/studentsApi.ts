// Typed hooks for the students slice (M3) — thin wrappers over the shared api client,
// mirroring the backend contract (internal/features/students). No component calls fetch
// directly (plan/bridges.md §1).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/queryKeys';

export interface GuardianInput {
  name: string;
  phone: string;
  email?: string;
  relation: string;
  is_primary: boolean;
  can_pay: boolean;
}

export interface OnboardInput {
  name: string;
  admission_no: string;
  dob?: string;
  gender?: string;
  category?: string;
  blood_group?: string;
  prior_school?: string;
  prior_class?: string;
  guardians?: GuardianInput[];
}

export interface OnboardResult {
  student_id: string;
  membership_id: string;
  login_identifier: string;
  temp_password: string;
  admission_no: string;
}

export interface StudentRow {
  id: string;
  admission_no: string;
  name: string;
  login_identifier: string;
  status: string;
  gender?: string;
  created_at: string;
}

export interface GuardianDTO {
  id: string;
  name: string;
  phone: string;
  email?: string;
  relation: string;
  is_primary: boolean;
  can_pay: boolean;
}

export interface StudentDetail extends StudentRow {
  dob?: string;
  category?: string;
  blood_group?: string;
  prior_school?: string;
  prior_class?: string;
  guardians: GuardianDTO[];
}

export function useStudents() {
  return useQuery({
    queryKey: queryKeys.students,
    queryFn: () => api.get<{ students: StudentRow[] }>('/api/v1/students'),
  });
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: [...queryKeys.students, id],
    queryFn: () => api.get<StudentDetail>(`/api/v1/students/${id}`),
    enabled: !!id,
  });
}

export function useOnboardStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OnboardInput) => api.post<OnboardResult>('/api/v1/students/onboard', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.students }),
  });
}
