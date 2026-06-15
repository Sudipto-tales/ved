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

// Guardian record-management shapes (mirror internal/features/students GuardianRow /
// GuardianDetail). Read-only directory + detail.
export interface GuardianRow {
  id: string;
  name: string;
  phone: string;
  email?: string;
  relation_default: string;
  child_count: number;
}

export interface GuardianChild {
  student_id: string;
  name: string;
  admission_no: string;
  relation: string;
  is_primary: boolean;
  can_pay: boolean;
}

export interface GuardianDetail {
  id: string;
  name: string;
  phone: string;
  email?: string;
  occupation?: string;
  children: GuardianChild[];
}

export interface PromoteResult {
  guardian_id: string;
  membership_id: string;
  login_identifier: string;
  temp_password: string;
}

// Local query keys for the students slice (kept here per ownership; not in shared keys).
export const studentsKeys = {
  guardians: ['students', 'guardians'] as const,
  guardian: (id: string) => ['students', 'guardians', id] as const,
};

export function useStudents() {
  return useQuery({
    queryKey: queryKeys.students,
    queryFn: () => api.get<{ students: StudentRow[] }>('/api/v1/students'),
  });
}

export function useGuardians() {
  return useQuery({
    queryKey: studentsKeys.guardians,
    queryFn: () => api.get<{ guardians: GuardianRow[] }>('/api/v1/students/guardians'),
  });
}

export function useGuardian(id: string) {
  return useQuery({
    queryKey: studentsKeys.guardian(id),
    queryFn: () => api.get<GuardianDetail>(`/api/v1/students/guardians/${id}`),
    enabled: !!id,
  });
}

export function usePromoteGuardian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<PromoteResult>(`/api/v1/students/guardians/${id}/promote`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: studentsKeys.guardians }),
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

// Per-student academics summary (enrollment + attendance + exam marks) for the profile.
export interface StudentAcademics {
  enrolled: boolean;
  enrollment_id?: string;
  section_name?: string;
  roll_no?: string | null;
  status?: string | null;
  attendance: { PRESENT?: number; ABSENT?: number; LATE?: number; EXCUSED?: number; TOTAL?: number };
  marks: { exam: string; subject: string; marks: number; max_marks: number }[];
}

export function useStudentAcademics(id: string) {
  return useQuery({
    queryKey: [...queryKeys.students, id, 'academics'],
    queryFn: () => api.get<StudentAcademics>(`/api/v1/academics/students/${id}/academics`),
    enabled: !!id,
  });
}
