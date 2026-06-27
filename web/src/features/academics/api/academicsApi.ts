// Academics slice FE surface (M5). Types + HTTP calls are GENERATED from the frozen
// OpenAPI spec (server/api/openapi) via `npm run gen:api`. Structure (program → stage →
// subject → section → enrollment) is mutable config; attendance + marks are the
// append-only ledgers. Query keys stay LOCAL here. See studentsApi.ts for the pattern.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listPrograms,
  createProgram,
  listStages,
  createStage,
  listAllStages,
  listSubjects,
  createSubject,
  listSections,
  createSection,
  listEnrollments,
  enrollStudent,
  listTeachingAssignments,
  createTeachingAssignment,
  listExams,
  createExam,
  listCurriculum,
  getAttendance,
  markAttendance,
  getMarks,
  enterMarks,
} from '@/shared/api/generated/academics/academics';
import { listTeachers } from '@/shared/api/generated/teachers/teachers';
import { listStudents } from '@/shared/api/generated/students/students';
import type {
  ListPrograms200ProgramsItem,
  ListStages200StagesItem,
  ListAllStages200StagesItem,
  ListSubjects200SubjectsItem,
  ListSections200SectionsItem,
  ListEnrollments200EnrollmentsItem,
  ListTeachingAssignments200TeachingAssignmentsItem,
  ListExams200ExamsItem,
  ListCurriculum200CurriculumItem,
  GetAttendance200AttendanceItem,
  GetMarks200MarksItem,
  ListTeachers200TeachersItem,
  ListStudents200StudentsItem,
} from '@/shared/api/generated/model';

// ---- query keys (local to academics) ---------------------------------------------
export const academicsKeys = {
  programs: ['academics', 'programs'] as const,
  stages: (programId: string) => ['academics', 'programs', programId, 'stages'] as const,
  allStages: ['academics', 'program-stages'] as const,
  subjects: ['academics', 'subjects'] as const,
  curriculum: (stageId: string) => ['academics', 'curriculum', stageId] as const,
  sections: ['academics', 'sections'] as const,
  enrollments: (sectionId: string) => ['academics', 'sections', sectionId, 'enrollments'] as const,
  teachingAssignments: ['academics', 'teaching-assignments'] as const,
  exams: ['academics', 'exams'] as const,
  attendance: (sectionId: string, date: string) => ['academics', 'attendance', sectionId, date] as const,
  marks: (examId: string, enrollmentId: string) => ['academics', 'marks', examId, enrollmentId] as const,
  teachers: ['academics', 'teachers'] as const,
  students: ['academics', 'students'] as const,
};

// ---- types (generated, re-exported under the slice's established names) -----------
export type Program = ListPrograms200ProgramsItem;
export type Stage = ListStages200StagesItem;
export type AllStage = ListAllStages200StagesItem;
export type Subject = ListSubjects200SubjectsItem;
export type Section = ListSections200SectionsItem;
export type Enrollment = ListEnrollments200EnrollmentsItem;
export type TeachingAssignment = ListTeachingAssignments200TeachingAssignmentsItem;
export type Exam = ListExams200ExamsItem;
export type CurriculumItem = ListCurriculum200CurriculumItem;
export type AttendanceRow = GetAttendance200AttendanceItem;
export type MarkRow = GetMarks200MarksItem;
export type TeacherRef = ListTeachers200TeachersItem;
export type StudentRef = ListStudents200StudentsItem;

// ---- reads ------------------------------------------------------------------------
export function usePrograms() {
  return useQuery({ queryKey: academicsKeys.programs, queryFn: ({ signal }) => listPrograms(signal) });
}

export function useStages(programId: string) {
  return useQuery({
    queryKey: academicsKeys.stages(programId),
    queryFn: ({ signal }) => listStages(programId, signal),
    enabled: !!programId,
  });
}

export function useAllStages() {
  return useQuery({ queryKey: academicsKeys.allStages, queryFn: ({ signal }) => listAllStages(signal) });
}

export function useSubjects() {
  return useQuery({ queryKey: academicsKeys.subjects, queryFn: ({ signal }) => listSubjects(signal) });
}

export function useCurriculum(stageId: string) {
  return useQuery({
    queryKey: academicsKeys.curriculum(stageId),
    queryFn: ({ signal }) => listCurriculum({ program_stage_id: stageId }, signal),
    enabled: !!stageId,
  });
}

export function useSections() {
  return useQuery({ queryKey: academicsKeys.sections, queryFn: ({ signal }) => listSections(signal) });
}

export function useEnrollments(sectionId: string) {
  return useQuery({
    queryKey: academicsKeys.enrollments(sectionId),
    queryFn: ({ signal }) => listEnrollments(sectionId, signal),
    enabled: !!sectionId,
  });
}

export function useTeachingAssignments() {
  return useQuery({ queryKey: academicsKeys.teachingAssignments, queryFn: ({ signal }) => listTeachingAssignments(signal) });
}

export function useExams() {
  return useQuery({ queryKey: academicsKeys.exams, queryFn: ({ signal }) => listExams(signal) });
}

export function useTeachers() {
  return useQuery({ queryKey: academicsKeys.teachers, queryFn: ({ signal }) => listTeachers(signal) });
}

export function useStudentsRef() {
  return useQuery({ queryKey: academicsKeys.students, queryFn: ({ signal }) => listStudents(signal) });
}

export function useAttendance(sectionId: string, date: string) {
  return useQuery({
    queryKey: academicsKeys.attendance(sectionId, date),
    queryFn: ({ signal }) => getAttendance({ section_id: sectionId, date }, signal),
    enabled: !!sectionId && !!date,
  });
}

export function useMarks(examId: string, enrollmentId: string) {
  return useQuery({
    queryKey: academicsKeys.marks(examId, enrollmentId),
    queryFn: ({ signal }) => getMarks({ exam_id: examId, enrollment_id: enrollmentId }, signal),
    enabled: !!examId && !!enrollmentId,
  });
}

// ---- writes -----------------------------------------------------------------------
export function useCreateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; code: string }) => createProgram(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicsKeys.programs }),
  });
}

export function useCreateStage(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; ordinal: number }) => createStage(programId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: academicsKeys.stages(programId) });
      qc.invalidateQueries({ queryKey: academicsKeys.allStages });
    },
  });
}

export function useCreateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; code: string; kind: string }) => createSubject(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicsKeys.subjects }),
  });
}

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { program_stage_id: string; name: string; capacity?: number }) => createSection(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicsKeys.sections }),
  });
}

export function useEnroll(sectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { student_id: string; roll_no?: string }) => enrollStudent(sectionId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicsKeys.enrollments(sectionId) }),
  });
}

export function useCreateTeachingAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { section_id: string; subject_id: string; teacher_id: string }) => createTeachingAssignment(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicsKeys.teachingAssignments }),
  });
}

export function useCreateExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; max_marks: number }) => createExam(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicsKeys.exams }),
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { section_id: string; marked_by: string; date: string; entries: { enrollment_id: string; status: string }[] }) =>
      markAttendance(body),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: academicsKeys.attendance(vars.section_id, vars.date) }),
  });
}

export function useEnterMarks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { exam_id: string; graded_by: string; entries: { enrollment_id: string; subject_id: string; marks: number }[] }) =>
      enterMarks(body),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['academics', 'marks', vars.exam_id] }),
  });
}
