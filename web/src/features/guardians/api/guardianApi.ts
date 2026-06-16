// Guardian portal FE surface (M7) — a child-scoped reader. Types + HTTP calls are
// GENERATED from the frozen OpenAPI spec (server/api/openapi) via `npm run gen:api`.
// Every endpoint is restricted server-side to the caller's own children (guardian_student
// + RLS); the client just renders. See studentsApi.ts for the pattern.
import { useQuery } from '@tanstack/react-query';
import {
  listChildren,
  getChildAttendance,
  getChildFees,
  listGuardianExams,
  getChildMarks,
} from '@/shared/api/generated/guardian/guardian';
import type {
  ListChildren200ChildrenItem,
  GetChildAttendance200Summary,
  GetChildFees200,
  ListGuardianExams200ExamsItem,
  GetChildMarks200MarksItem,
} from '@/shared/api/generated/model';

// Generated types, re-exported under the names this slice's components already use.
export type Child = ListChildren200ChildrenItem;
export type AttendanceSummary = GetChildAttendance200Summary;
export type ChildFees = GetChildFees200;
export type Exam = ListGuardianExams200ExamsItem;
export type ChildMark = GetChildMarks200MarksItem;

export const guardianKeys = {
  children: ['guardian', 'children'] as const,
  attendance: (id: string) => ['guardian', 'attendance', id] as const,
  fees: (id: string) => ['guardian', 'fees', id] as const,
  exams: ['guardian', 'exams'] as const,
  marks: (childId: string, examId: string) => ['guardian', 'marks', childId, examId] as const,
};

export function useChildren() {
  return useQuery({ queryKey: guardianKeys.children, queryFn: ({ signal }) => listChildren(signal) });
}

export function useChildAttendance(childId: string) {
  return useQuery({
    queryKey: guardianKeys.attendance(childId),
    queryFn: ({ signal }) => getChildAttendance(childId, signal),
    enabled: !!childId,
  });
}

export function useChildFees(childId: string) {
  return useQuery({
    queryKey: guardianKeys.fees(childId),
    queryFn: ({ signal }) => getChildFees(childId, signal),
    enabled: !!childId,
  });
}

export function useExams() {
  return useQuery({ queryKey: guardianKeys.exams, queryFn: ({ signal }) => listGuardianExams(signal) });
}

export function useChildMarks(childId: string, examId: string) {
  return useQuery({
    queryKey: guardianKeys.marks(childId, examId),
    queryFn: ({ signal }) => getChildMarks(childId, { exam_id: examId }, signal),
    enabled: !!childId && !!examId,
  });
}
