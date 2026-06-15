// Typed hooks for the teachers slice (M5) — thin wrappers over the shared api client,
// mirroring the backend contract (internal/features/teachers).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/queryKeys';

export interface OnboardInput {
  name: string;
  joining_date?: string;
  employee_code?: string;
  specialization?: string;
}

export interface OnboardResult {
  teacher_id: string;
  membership_id: string;
  login_identifier: string;
  temp_password: string;
}

export interface TeacherRow {
  id: string;
  name: string;
  login_identifier: string;
  status: string;
  employee_code?: string;
  specialization?: string;
  created_at: string;
}

export interface TeacherDetail extends TeacherRow {
  joining_date?: string;
}

export function useTeachers() {
  return useQuery({
    queryKey: queryKeys.teachers,
    queryFn: () => api.get<{ teachers: TeacherRow[] }>('/api/v1/teachers'),
  });
}

export function useTeacher(id: string) {
  return useQuery({
    queryKey: [...queryKeys.teachers, id],
    queryFn: () => api.get<TeacherDetail>(`/api/v1/teachers/${id}`),
    enabled: !!id,
  });
}

export function useOnboardTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OnboardInput) => api.post<OnboardResult>('/api/v1/teachers/onboard', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teachers }),
  });
}

// --- Teacher portal: academics tools (calls the existing academics slice; not edited here) ---

export interface AttendanceEntry {
  enrollment_id: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
}

export function useMarkAttendance() {
  return useMutation({
    mutationFn: (body: { section_id: string; marked_by: string; date: string; entries: AttendanceEntry[] }) =>
      api.post<void>('/api/v1/academics/attendance', body),
  });
}

export interface MarkEntryInput {
  enrollment_id: string;
  subject_id: string;
  marks: number;
}

export function useEnterMarks() {
  return useMutation({
    mutationFn: (body: { exam_id: string; graded_by: string; entries: MarkEntryInput[] }) =>
      api.post<void>('/api/v1/academics/marks', body),
  });
}
