// Typed hooks for the LMS / learning slice (M8). Teacher authoring + grading; the
// grade→marks integration happens server-side (a graded assignment feeds the one
// append-only marks ledger).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export interface Assignment {
  id: string;
  title: string;
  status: string;
  max_marks: number | null;
  due_at?: string;
}

export interface SubmissionRow {
  submission_id: string;
  student_id: string;
  student: string;
  status: string;
  submitted_at: string;
  marks: number | null;
}

export const learningKeys = {
  assignments: (taId: string) => ['learning', 'assignments', taId] as const,
  submissions: (assignmentId: string) => ['learning', 'submissions', assignmentId] as const,
};

export function useAssignments(taId: string) {
  return useQuery({
    queryKey: learningKeys.assignments(taId),
    queryFn: () => api.get<{ assignments: Assignment[] }>(`/api/v1/learning/teaching-assignments/${taId}/assignments`),
    enabled: !!taId,
  });
}

export function useCreateAssignment(taId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; instructions?: string; due_at?: string; max_marks?: number | null }) =>
      api.post<{ assignment_id: string }>('/api/v1/learning/assignments', { teaching_assignment_id: taId, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: learningKeys.assignments(taId) }),
  });
}

export function useSubmissions(assignmentId: string) {
  return useQuery({
    queryKey: learningKeys.submissions(assignmentId),
    queryFn: () => api.get<{ submissions: SubmissionRow[] }>(`/api/v1/learning/assignments/${assignmentId}/submissions`),
    enabled: !!assignmentId,
  });
}

export function useGrade(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, marks, feedback }: { submissionId: string; marks: number; feedback?: string }) =>
      api.post<{ grade_id: string }>(`/api/v1/learning/submissions/${submissionId}/grade`, { marks, feedback }),
    onSuccess: () => qc.invalidateQueries({ queryKey: learningKeys.submissions(assignmentId) }),
  });
}
