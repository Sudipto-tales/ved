// Typed hooks for the academics slice (M5) — thin wrappers over the shared api client,
// mirroring the backend contract (internal/features/academics). Structure (program →
// stage → subject → section → enrollment) is mutable config; attendance + marks are the
// append-only ledgers (corrections are new rows, latest by hlc wins). No component calls
// fetch directly. Query keys are defined LOCALLY here.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

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

// ---- types ------------------------------------------------------------------------
export interface Program {
  id: string;
  name: string;
  code: string;
  enrollment_mode: string;
  status: string;
}
export interface Stage {
  id: string;
  name: string;
  ordinal: number;
}
export interface AllStage extends Stage {
  program_id: string;
  program_name: string;
}
export interface Subject {
  id: string;
  name: string;
  code: string;
  kind: string;
}
export interface Section {
  id: string;
  name: string;
  program_stage_id: string;
  academic_year_id: string;
  capacity: number | null;
  stage_name: string;
  program_name: string;
}
export interface Enrollment {
  id: string;
  student_id: string;
  roll_no: string | null;
  status: string;
  login_identifier: string;
}
export interface TeachingAssignment {
  id: string;
  section_id: string;
  subject_id: string;
  teacher_id: string;
}
export interface Exam {
  id: string;
  name: string;
  max_marks: number;
}
export interface CurriculumItem {
  id: string;
  subject_id: string;
  requirement: string;
  subject_name: string;
  subject_code: string;
}
export interface TeacherRef {
  id: string;
  name: string;
  login_identifier: string;
}
export interface StudentRef {
  id: string;
  name: string;
  login_identifier: string;
}
export interface AttendanceRow {
  enrollment_id: string;
  status: string;
}
export interface MarkRow {
  subject_id: string;
  marks: number;
}

// ---- reads ------------------------------------------------------------------------
export function usePrograms() {
  return useQuery({
    queryKey: academicsKeys.programs,
    queryFn: () => api.get<{ programs: Program[] }>('/api/v1/academics/programs'),
  });
}

export function useStages(programId: string) {
  return useQuery({
    queryKey: academicsKeys.stages(programId),
    queryFn: () => api.get<{ stages: Stage[] }>(`/api/v1/academics/programs/${programId}/stages`),
    enabled: !!programId,
  });
}

export function useAllStages() {
  return useQuery({
    queryKey: academicsKeys.allStages,
    queryFn: () => api.get<{ stages: AllStage[] }>('/api/v1/academics/program-stages'),
  });
}

export function useSubjects() {
  return useQuery({
    queryKey: academicsKeys.subjects,
    queryFn: () => api.get<{ subjects: Subject[] }>('/api/v1/academics/subjects'),
  });
}

export function useCurriculum(stageId: string) {
  return useQuery({
    queryKey: academicsKeys.curriculum(stageId),
    queryFn: () => api.get<{ curriculum: CurriculumItem[] }>(`/api/v1/academics/curriculum?program_stage_id=${stageId}`),
    enabled: !!stageId,
  });
}

export function useSections() {
  return useQuery({
    queryKey: academicsKeys.sections,
    queryFn: () => api.get<{ sections: Section[] }>('/api/v1/academics/sections'),
  });
}

export function useEnrollments(sectionId: string) {
  return useQuery({
    queryKey: academicsKeys.enrollments(sectionId),
    queryFn: () => api.get<{ enrollments: Enrollment[] }>(`/api/v1/academics/sections/${sectionId}/enrollments`),
    enabled: !!sectionId,
  });
}

export function useTeachingAssignments() {
  return useQuery({
    queryKey: academicsKeys.teachingAssignments,
    queryFn: () => api.get<{ teaching_assignments: TeachingAssignment[] }>('/api/v1/academics/teaching-assignments'),
  });
}

export function useExams() {
  return useQuery({
    queryKey: academicsKeys.exams,
    queryFn: () => api.get<{ exams: Exam[] }>('/api/v1/academics/exams'),
  });
}

export function useTeachers() {
  return useQuery({
    queryKey: academicsKeys.teachers,
    queryFn: () => api.get<{ teachers: TeacherRef[] }>('/api/v1/teachers'),
  });
}

export function useStudentsRef() {
  return useQuery({
    queryKey: academicsKeys.students,
    queryFn: () => api.get<{ students: StudentRef[] }>('/api/v1/students'),
  });
}

export function useAttendance(sectionId: string, date: string) {
  return useQuery({
    queryKey: academicsKeys.attendance(sectionId, date),
    queryFn: () => api.get<{ attendance: AttendanceRow[] }>(`/api/v1/academics/attendance?section_id=${sectionId}&date=${date}`),
    enabled: !!sectionId && !!date,
  });
}

export function useMarks(examId: string, enrollmentId: string) {
  return useQuery({
    queryKey: academicsKeys.marks(examId, enrollmentId),
    queryFn: () => api.get<{ marks: MarkRow[] }>(`/api/v1/academics/marks?exam_id=${examId}&enrollment_id=${enrollmentId}`),
    enabled: !!examId && !!enrollmentId,
  });
}

// ---- writes -----------------------------------------------------------------------
export function useCreateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; code: string }) => api.post<{ id: string }>('/api/v1/academics/programs', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicsKeys.programs }),
  });
}

export function useCreateStage(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; ordinal: number }) =>
      api.post<{ id: string }>(`/api/v1/academics/programs/${programId}/stages`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: academicsKeys.stages(programId) });
      qc.invalidateQueries({ queryKey: academicsKeys.allStages });
    },
  });
}

export function useCreateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; code: string; kind: string }) =>
      api.post<{ id: string }>('/api/v1/academics/subjects', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicsKeys.subjects }),
  });
}

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { program_stage_id: string; name: string; capacity?: number }) =>
      api.post<{ id: string }>('/api/v1/academics/sections', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicsKeys.sections }),
  });
}

export function useEnroll(sectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { student_id: string; roll_no?: string }) =>
      api.post<{ id: string }>(`/api/v1/academics/sections/${sectionId}/enroll`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicsKeys.enrollments(sectionId) }),
  });
}

export function useCreateTeachingAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { section_id: string; subject_id: string; teacher_id: string }) =>
      api.post<{ id: string }>('/api/v1/academics/teaching-assignments', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicsKeys.teachingAssignments }),
  });
}

export function useCreateExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; max_marks: number }) => api.post<{ id: string }>('/api/v1/academics/exams', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicsKeys.exams }),
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      section_id: string;
      marked_by: string;
      date: string;
      entries: { enrollment_id: string; status: string }[];
    }) => api.post<void>('/api/v1/academics/attendance', body),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: academicsKeys.attendance(vars.section_id, vars.date) }),
  });
}

export function useEnterMarks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      exam_id: string;
      graded_by: string;
      entries: { enrollment_id: string; subject_id: string; marks: number }[];
    }) => api.post<void>('/api/v1/academics/marks', body),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['academics', 'marks', vars.exam_id] }),
  });
}
