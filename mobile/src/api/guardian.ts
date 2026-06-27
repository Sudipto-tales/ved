// Typed guardian read-API + react-query hooks. These map 1:1 to the guardian portal
// endpoints in server/internal/features/guardian/guardian.go (the same contract the web
// app consumes via its generated client). Reads only — the read-heavy mobile slice.
import { useQuery } from '@tanstack/react-query';
import { apiGet, type Session } from './client';

export type Child = {
  student_id: string;
  name: string;
  admission_no: string;
  relation: string;
  is_primary: boolean;
  can_pay: boolean;
};

export type AttendanceSummary = Record<string, number>;

export type LedgerEntry = {
  direction: 'DEBIT' | 'CREDIT' | string;
  amount: number;
  source_type?: string;
  created_at?: string;
};

export type ChildFees = {
  outstanding: number;
  total_debit: number;
  total_credit: number;
  entries?: LedgerEntry[];
};

export type Exam = { id: string; name: string; max_marks?: number };
export type ChildMark = { subject_id: string; subject_name?: string; marks: number };

export function useChildren(session: Session) {
  return useQuery<{ children: Child[] }>({
    queryKey: ['children', session.slug],
    queryFn: () => apiGet<{ children: Child[] }>(session, '/api/v1/guardian/children'),
  });
}

export function useChildAttendance(session: Session, childId: string) {
  return useQuery<{ summary: AttendanceSummary; note?: string }>({
    queryKey: ['attendance', session.slug, childId],
    queryFn: () =>
      apiGet<{ summary: AttendanceSummary; note?: string }>(
        session,
        `/api/v1/guardian/children/${childId}/attendance`,
      ),
    enabled: !!childId,
  });
}

export function useChildFees(session: Session, childId: string) {
  return useQuery<ChildFees>({
    queryKey: ['fees', session.slug, childId],
    queryFn: () => apiGet<ChildFees>(session, `/api/v1/guardian/children/${childId}/fees`),
    enabled: !!childId,
  });
}

export function useExams(session: Session) {
  return useQuery<{ exams: Exam[] }>({
    queryKey: ['exams', session.slug],
    queryFn: () => apiGet<{ exams: Exam[] }>(session, '/api/v1/guardian/exams'),
  });
}

export function useChildMarks(session: Session, childId: string, examId: string) {
  return useQuery<{ marks: ChildMark[]; note?: string }>({
    queryKey: ['marks', session.slug, childId, examId],
    queryFn: () =>
      apiGet<{ marks: ChildMark[]; note?: string }>(
        session,
        `/api/v1/guardian/children/${childId}/marks?exam_id=${examId}`,
      ),
    enabled: !!childId && !!examId,
  });
}
