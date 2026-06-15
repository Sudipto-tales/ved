import type { PageDef } from '@/shared/types/page';

export const learningPages: PageDef[] = [
  // Teacher (LMS authoring)
  {
    path: 'teacher/lesson-plans',
    title: 'Lesson Plans',
    persona: 'TEACHER',
    permission: 'academics.manage',
    tier: 'T3',
    status: 'planned',
    nav: true,
  },
  {
    path: 'teacher/materials',
    title: 'Materials',
    persona: 'TEACHER',
    permission: 'academics.manage',
    tier: 'T3',
    status: 'planned',
    nav: true,
  },
  {
    path: 'teacher/assignments',
    title: 'Assignments',
    persona: 'TEACHER',
    permission: 'academics.manage',
    tier: 'T3',
    status: 'done',
    nav: true,
    element: () => import('./pages/AssignmentsPage'),
  },
  {
    path: 'teacher/assignments/:id',
    title: 'Assignment Detail',
    persona: 'TEACHER',
    permission: 'academics.manage',
    tier: 'T3',
    status: 'done',
    element: () => import('./pages/AssignmentDetailPage'),
  },
  {
    path: 'teacher/grade-submissions',
    title: 'Grade Submissions',
    persona: 'TEACHER',
    permission: 'marks.enter',
    tier: 'T3',
    status: 'planned',
    nav: true,
  },
  // Student (self-service — no permission gate)
  {
    path: 'assignments',
    title: 'My Assignments',
    persona: 'STUDENT',
    tier: 'T3',
    status: 'planned',
    nav: true,
  },
  {
    path: 'assignments/:id',
    title: 'Assignment',
    persona: 'STUDENT',
    tier: 'T3',
    status: 'planned',
  },
  {
    path: 'assignments/:id/submit',
    title: 'Submit Work',
    persona: 'STUDENT',
    tier: 'T3',
    status: 'planned',
  },
  // Guardian (self-scoped visibility — no permission gate)
  {
    path: 'child-assignments',
    title: 'Child Assignment Status',
    persona: 'GUARDIAN',
    tier: 'T3',
    status: 'planned',
    nav: true,
  },
];
