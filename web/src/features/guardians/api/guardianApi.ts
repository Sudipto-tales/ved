// Guardian portal FE surface (M7) — a child-scoped reader. Types + HTTP calls are
// GENERATED from the frozen OpenAPI spec (server/api/openapi) via `npm run gen:api`.
// Every endpoint is restricted server-side to the caller's own children (guardian_student
// + RLS); the client just renders. See studentsApi.ts for the pattern.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listChildren,
  getChildAttendance,
  getChildFees,
  listGuardianExams,
  getChildMarks,
  payChildFees,
  requestChildLeave,
  listMyLeaveRequests,
  requestContactChange,
} from '@/shared/api/generated/guardian/guardian';
import type {
  ListChildren200ChildrenItem,
  GetChildAttendance200Summary,
  GetChildFees200,
  ListGuardianExams200ExamsItem,
  GetChildMarks200MarksItem,
  PayChildFeesBody,
  RequestChildLeaveBody,
  RequestContactChangeBody,
  ListMyLeaveRequests200LeaveRequestsItem,
} from '@/shared/api/generated/model';

// Generated types, re-exported under the names this slice's components already use.
export type Child = ListChildren200ChildrenItem;
export type AttendanceSummary = GetChildAttendance200Summary;
export type ChildFees = GetChildFees200;
export type Exam = ListGuardianExams200ExamsItem;
export type ChildMark = GetChildMarks200MarksItem;
export type PayInput = PayChildFeesBody;
export type LeaveInput = RequestChildLeaveBody;
export type ContactInput = RequestContactChangeBody;
export type LeaveRequest = ListMyLeaveRequests200LeaveRequestsItem;

export const guardianKeys = {
  children: ['guardian', 'children'] as const,
  attendance: (id: string) => ['guardian', 'attendance', id] as const,
  fees: (id: string) => ['guardian', 'fees', id] as const,
  exams: ['guardian', 'exams'] as const,
  marks: (childId: string, examId: string) => ['guardian', 'marks', childId, examId] as const,
  leaveRequests: ['guardian', 'leave-requests'] as const,
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

// ---- Tier-2 guarded writes (docs/18) ----

// Simulated online fee payment for a child (gated server-side by guardian.pay_fees + can_pay).
export function usePayChildFees(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PayInput) => payChildFees(childId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: guardianKeys.fees(childId) }),
  });
}

// Raise a child-absence request (PENDING → a teacher decides).
export function useRequestLeave(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LeaveInput) => requestChildLeave(childId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: guardianKeys.leaveRequests }),
  });
}

// The caller-guardian's own leave-request history.
export function useMyLeaveRequests() {
  return useQuery({
    queryKey: guardianKeys.leaveRequests,
    queryFn: ({ signal }) => listMyLeaveRequests(signal),
  });
}

// Propose new contact details for the guardian's own record (maker-checker).
export function useRequestContactChange() {
  return useMutation({
    mutationFn: (body: ContactInput) => requestContactChange(body),
  });
}
