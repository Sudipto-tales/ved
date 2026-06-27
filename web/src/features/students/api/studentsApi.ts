// Students slice FE surface. Types + HTTP calls are GENERATED from the frozen OpenAPI
// spec (server/api/openapi) via `npm run gen:api` — this file no longer hand-rolls the
// contract (plan/bridges.md §1). It re-exports the generated types under the slice's
// established names and wraps the generated operation functions in react-query hooks
// that keep this slice's query keys + cache invalidation.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/queryKeys';
import {
  onboardStudent,
  listStudents,
  getStudent,
  listGuardians,
  getGuardian,
  promoteGuardian,
} from '@/shared/api/generated/students/students';
import type {
  OnboardStudentBody,
  OnboardStudent201,
  OnboardStudentBodyGuardiansItem,
  ListStudents200StudentsItem,
  GetStudent200,
  ListGuardians200GuardiansItem,
  GetGuardian200,
  GetGuardian200ChildrenItem,
  PromoteGuardian201,
} from '@/shared/api/generated/model';

// Generated types, re-exported under the names this slice's components already use.
export type GuardianInput = OnboardStudentBodyGuardiansItem;
export type OnboardInput = OnboardStudentBody;
export type OnboardResult = OnboardStudent201;
export type StudentRow = ListStudents200StudentsItem;
export type StudentDetail = GetStudent200;
export type GuardianDTO = GetStudent200['guardians'][number];
export type GuardianRow = ListGuardians200GuardiansItem;
export type GuardianChild = GetGuardian200ChildrenItem;
export type GuardianDetail = GetGuardian200;
export type PromoteResult = PromoteGuardian201;

// Local query keys for the students slice (kept here per ownership; not in shared keys).
export const studentsKeys = {
  guardians: ['students', 'guardians'] as const,
  guardian: (id: string) => ['students', 'guardians', id] as const,
};

export function useStudents() {
  return useQuery({
    queryKey: queryKeys.students,
    queryFn: ({ signal }) => listStudents(signal),
  });
}

export function useGuardians() {
  return useQuery({
    queryKey: studentsKeys.guardians,
    queryFn: ({ signal }) => listGuardians(signal),
  });
}

export function useGuardian(id: string) {
  return useQuery({
    queryKey: studentsKeys.guardian(id),
    queryFn: ({ signal }) => getGuardian(id, signal),
    enabled: !!id,
  });
}

export function usePromoteGuardian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => promoteGuardian(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: studentsKeys.guardians }),
  });
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: [...queryKeys.students, id],
    queryFn: ({ signal }) => getStudent(id, signal),
    enabled: !!id,
  });
}

export function useOnboardStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OnboardInput) => onboardStudent(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.students }),
  });
}

// Per-student academics summary (enrollment + attendance + exam marks) for the profile.
// This is an academics-slice endpoint; it stays on the shared client until the academics
// spec is authored (replication step).
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
