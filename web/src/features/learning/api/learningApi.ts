// LMS / learning slice FE surface (M8). Types + HTTP calls are GENERATED from the frozen
// OpenAPI spec (server/api/openapi) via `npm run gen:api`. Teacher authoring + grading;
// the grade→marks integration happens server-side. See studentsApi.ts for the pattern.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAssignment,
  listAssignments,
  addMaterial,
  listMaterials,
  submitAssignment,
  gradeSubmission,
  listSubmissions,
} from '@/shared/api/generated/learning/learning';
import type {
  ListAssignments200AssignmentsItem,
  ListSubmissions200SubmissionsItem,
  ListMaterials200MaterialsItem,
  SubmitAssignmentBodyFilesItem,
} from '@/shared/api/generated/model';

// Generated types, re-exported under the names this slice's components already use.
export type Assignment = ListAssignments200AssignmentsItem;
export type SubmissionRow = ListSubmissions200SubmissionsItem;
export type Material = ListMaterials200MaterialsItem;
export type SubmissionFileInput = SubmitAssignmentBodyFilesItem;

export const learningKeys = {
  assignments: (taId: string) => ['learning', 'assignments', taId] as const,
  submissions: (assignmentId: string) => ['learning', 'submissions', assignmentId] as const,
  materials: (assignmentId: string) => ['learning', 'materials', assignmentId] as const,
};

export function useAssignments(taId: string) {
  return useQuery({
    queryKey: learningKeys.assignments(taId),
    queryFn: ({ signal }) => listAssignments(taId, signal),
    enabled: !!taId,
  });
}

export function useCreateAssignment(taId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; instructions?: string; due_at?: string; max_marks?: number | null }) =>
      createAssignment({ teaching_assignment_id: taId, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: learningKeys.assignments(taId) }),
  });
}

export function useSubmissions(assignmentId: string) {
  return useQuery({
    queryKey: learningKeys.submissions(assignmentId),
    queryFn: ({ signal }) => listSubmissions(assignmentId, signal),
    enabled: !!assignmentId,
  });
}

export function useGrade(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, marks, feedback }: { submissionId: string; marks: number; feedback?: string }) =>
      gradeSubmission(submissionId, { marks, feedback }),
    onSuccess: () => qc.invalidateQueries({ queryKey: learningKeys.submissions(assignmentId) }),
  });
}

export function useMaterials(assignmentId: string) {
  return useQuery({
    queryKey: learningKeys.materials(assignmentId),
    queryFn: ({ signal }) => listMaterials(assignmentId, signal),
    enabled: !!assignmentId,
  });
}

export function useAddMaterial(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; kind: string; url?: string; body?: string }) =>
      addMaterial(assignmentId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: learningKeys.materials(assignmentId) }),
  });
}

export function useSubmitWork(assignmentId: string) {
  return useMutation({
    mutationFn: (files: SubmissionFileInput[]) => submitAssignment(assignmentId, { files }),
  });
}
