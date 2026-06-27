// The brain behind the guided school-setup checklist (docs/26). It reads the existing
// per-tenant list endpoints, derives whether each setup step is DONE, and — using the
// dependency chain — whether a step is BLOCKED (a prerequisite is still missing). Both the
// dashboard checklist and the per-page SetupGate banners consume this, so "create a teacher
// before assigning classes" is defined in exactly ONE place.
import { useAcademicYears } from '@/features/admin/api/adminApi';
import {
  usePrograms,
  useAllStages,
  useSubjects,
  useSections,
  useTeachingAssignments,
} from '@/features/academics/api/academicsApi';
import { useTeachers } from '@/features/teachers/api/teachersApi';
import { useStudents } from '@/features/students/api/studentsApi';
import { useFeeHeads } from '@/features/finance/api/financeApi';

export type SetupStepKey =
  | 'academic-year'
  | 'programs'
  | 'sections'
  | 'subjects'
  | 'teachers'
  | 'teaching-assignments'
  | 'students'
  | 'fees';

export interface Prereq {
  label: string;
  to: string;
}

export interface SetupStep {
  key: SetupStepKey;
  label: string;
  hint: string;
  to: string;
  permission?: string;
  done: boolean;
  /** Unmet prerequisites — non-empty means this step is blocked. */
  blockedBy: Prereq[];
}

export interface SetupProgress {
  steps: SetupStep[];
  byKey: Record<SetupStepKey, SetupStep>;
  doneCount: number;
  total: number;
  percent: number;
  /** True once every step is done — the dashboard hides the checklist. */
  complete: boolean;
  loading: boolean;
}

export function useSetupProgress(): SetupProgress {
  const years = useAcademicYears();
  const programs = usePrograms();
  const stages = useAllStages();
  const subjects = useSubjects();
  const sections = useSections();
  const assignments = useTeachingAssignments();
  const teachers = useTeachers();
  const students = useStudents();
  const feeHeads = useFeeHeads();

  const has = {
    academicYear: (years.data?.academic_years?.length ?? 0) > 0,
    programs: (programs.data?.programs?.length ?? 0) > 0,
    stages: (stages.data?.stages?.length ?? 0) > 0,
    sections: (sections.data?.sections?.length ?? 0) > 0,
    subjects: (subjects.data?.subjects?.length ?? 0) > 0,
    teachers: (teachers.data?.teachers?.length ?? 0) > 0,
    assignments: (assignments.data?.teaching_assignments?.length ?? 0) > 0,
    students: (students.data?.students?.length ?? 0) > 0,
    fees: (feeHeads.data?.fee_heads?.length ?? 0) > 0,
  };

  // Prereq link targets reused across steps.
  const P = {
    academicYear: { label: 'Academic year', to: '/admin/academic-year' },
    programs: { label: 'Programs', to: '/programs' },
    sections: { label: 'Sections', to: '/sections' },
    subjects: { label: 'Subjects', to: '/subjects' },
    teachers: { label: 'Teachers', to: '/teachers' },
  };

  const steps: SetupStep[] = [
    {
      key: 'academic-year',
      label: 'Academic year & terms',
      hint: 'Anchors fees, exams, attendance and promotion — set this up first.',
      to: '/admin/academic-year',
      permission: 'tenant.settings',
      done: has.academicYear,
      blockedBy: [],
    },
    {
      key: 'programs',
      label: 'Programs & stages',
      hint: 'The grades / programs your school offers — the shelves people and classes hang off.',
      to: '/programs',
      permission: 'academics.manage',
      done: has.programs,
      blockedBy: has.academicYear ? [] : [P.academicYear],
    },
    {
      key: 'sections',
      label: 'Sections',
      hint: 'Students enrol into sections and classes are taught to them.',
      to: '/sections',
      permission: 'academics.manage',
      done: has.sections,
      blockedBy: has.programs && has.stages ? [] : [P.programs],
    },
    {
      key: 'subjects',
      label: 'Subjects',
      hint: 'What gets taught — needed before assigning classes.',
      to: '/subjects',
      permission: 'academics.manage',
      done: has.subjects,
      blockedBy: has.programs ? [] : [P.programs],
    },
    {
      key: 'teachers',
      label: 'Teachers',
      hint: 'Onboard the teachers who will take the classes.',
      to: '/teachers',
      permission: 'teacher.read',
      done: has.teachers,
      blockedBy: [],
    },
    {
      key: 'teaching-assignments',
      label: 'Teaching assignments',
      hint: 'Bind a teacher to a section + subject — who teaches what, where.',
      to: '/teaching-assignments',
      permission: 'academics.manage',
      done: has.assignments,
      blockedBy: [
        ...(has.teachers ? [] : [P.teachers]),
        ...(has.sections ? [] : [P.sections]),
        ...(has.subjects ? [] : [P.subjects]),
      ],
    },
    {
      key: 'students',
      label: 'Students',
      hint: 'Onboard students and enrol them into a section.',
      to: '/students',
      permission: 'student.read',
      done: has.students,
      blockedBy: has.sections ? [] : [P.sections],
    },
    {
      key: 'fees',
      label: 'Fees',
      hint: 'Define fee heads and structures before you raise invoices.',
      to: '/fee-heads',
      permission: 'fee.manage',
      done: has.fees,
      blockedBy: has.academicYear ? [] : [P.academicYear],
    },
  ];

  const byKey = Object.fromEntries(steps.map((s) => [s.key, s])) as Record<SetupStepKey, SetupStep>;
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  const loading =
    years.isLoading ||
    programs.isLoading ||
    stages.isLoading ||
    subjects.isLoading ||
    sections.isLoading ||
    assignments.isLoading ||
    teachers.isLoading ||
    students.isLoading ||
    feeHeads.isLoading;

  return {
    steps,
    byKey,
    doneCount,
    total,
    percent: total ? Math.round((doneCount / total) * 100) : 0,
    complete: doneCount === total,
    loading,
  };
}
