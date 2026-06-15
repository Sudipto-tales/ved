// Typed hooks for the guardian portal (M7) — a child-scoped reader. Every endpoint is
// restricted server-side to the caller's own children (guardian_student + RLS); the
// client just renders what comes back.
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export interface Child {
  student_id: string;
  name: string;
  admission_no: string;
  relation: string;
  is_primary: boolean;
  can_pay: boolean;
}

export interface AttendanceSummary {
  PRESENT?: number;
  ABSENT?: number;
  LATE?: number;
  EXCUSED?: number;
  TOTAL?: number;
}

export interface ChildFees {
  entries: { id: string; direction: 'DEBIT' | 'CREDIT'; amount: number; source_type: string }[];
  total_debit: number;
  total_credit: number;
  outstanding: number;
}

export interface Exam {
  id: string;
  name: string;
  max_marks: number;
}

export interface ChildMark {
  subject_id: string;
  subject_name?: string;
  marks: number;
}

export const guardianKeys = {
  children: ['guardian', 'children'] as const,
  attendance: (id: string) => ['guardian', 'attendance', id] as const,
  fees: (id: string) => ['guardian', 'fees', id] as const,
  exams: ['guardian', 'exams'] as const,
  marks: (childId: string, examId: string) => ['guardian', 'marks', childId, examId] as const,
};

export function useChildren() {
  return useQuery({
    queryKey: guardianKeys.children,
    queryFn: () => api.get<{ children: Child[] }>('/api/v1/guardian/children'),
  });
}

export function useChildAttendance(childId: string) {
  return useQuery({
    queryKey: guardianKeys.attendance(childId),
    queryFn: () => api.get<{ summary: AttendanceSummary; note?: string }>(`/api/v1/guardian/children/${childId}/attendance`),
    enabled: !!childId,
  });
}

export function useChildFees(childId: string) {
  return useQuery({
    queryKey: guardianKeys.fees(childId),
    queryFn: () => api.get<ChildFees>(`/api/v1/guardian/children/${childId}/fees`),
    enabled: !!childId,
  });
}

export function useExams() {
  return useQuery({
    queryKey: guardianKeys.exams,
    queryFn: () => api.get<{ exams: Exam[] }>('/api/v1/guardian/exams'),
  });
}

export function useChildMarks(childId: string, examId: string) {
  return useQuery({
    queryKey: guardianKeys.marks(childId, examId),
    queryFn: () =>
      api.get<{ marks: ChildMark[]; note?: string }>(
        `/api/v1/guardian/children/${childId}/marks?exam_id=${examId}`,
      ),
    enabled: !!childId && !!examId,
  });
}
