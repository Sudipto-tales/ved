// Teachers slice FE surface (M5). Types + HTTP calls are GENERATED from the frozen
// OpenAPI spec (server/api/openapi) via `npm run gen:api` — see studentsApi.ts for the
// reference pattern. The academics-portal helpers below stay on the shared client until
// the academics spec is authored.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/queryKeys';
import { onboardTeacher, listTeachers, getTeacher } from '@/shared/api/generated/teachers/teachers';
import type {
  OnboardTeacherBody,
  OnboardTeacher201,
  ListTeachers200TeachersItem,
  GetTeacher200,
} from '@/shared/api/generated/model';

// Generated types, re-exported under the names this slice's components already use.
export type OnboardInput = OnboardTeacherBody;
export type OnboardResult = OnboardTeacher201;
export type TeacherRow = ListTeachers200TeachersItem;
export type TeacherDetail = GetTeacher200;

export function useTeachers() {
  return useQuery({
    queryKey: queryKeys.teachers,
    queryFn: ({ signal }) => listTeachers(signal),
  });
}

export function useTeacher(id: string) {
  return useQuery({
    queryKey: [...queryKeys.teachers, id],
    queryFn: ({ signal }) => getTeacher(id, signal),
    enabled: !!id,
  });
}

export function useOnboardTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OnboardInput) => onboardTeacher(body),
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
