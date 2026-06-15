import type { PageDef } from '@/shared/types/page';

export const teachersPages: PageDef[] = [
  // --- ADMIN / STAFF: People → Teachers management ---
  {
    path: 'teachers',
    title: 'Teachers',
    persona: 'ADMIN',
    permission: 'teacher.read',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./pages/TeachersRosterPage'),
  },
  {
    path: 'teachers/onboard',
    title: 'Onboard teacher',
    persona: 'ADMIN',
    permission: 'teacher.onboard',
    tier: 'T1',
    status: 'done',
    element: () => import('./pages/OnboardTeacherPage'),
  },
  {
    path: 'teachers/:id',
    title: 'Teacher detail',
    persona: 'ADMIN',
    permission: 'teacher.read',
    tier: 'T1',
    status: 'done',
    element: () => import('./pages/TeacherDetailPage'),
  },

  // --- TEACHER: portal (identity-scoped, no permission gate) ---
  {
    path: 'portal/teacher',
    title: 'Dashboard',
    persona: 'TEACHER',
    tier: 'T1',
    status: 'planned',
    nav: true,
  },
  {
    path: 'portal/teacher/sections',
    title: 'My sections / students',
    persona: 'TEACHER',
    tier: 'T1',
    status: 'planned',
    nav: true,
  },
  {
    path: 'portal/teacher/attendance',
    title: 'Mark attendance',
    persona: 'TEACHER',
    permission: 'attendance.mark',
    tier: 'T1',
    status: 'planned',
    nav: true,
  },
  {
    path: 'portal/teacher/marks',
    title: 'Enter marks',
    persona: 'TEACHER',
    permission: 'marks.enter',
    tier: 'T2',
    status: 'planned',
    nav: true,
  },
  {
    path: 'portal/teacher/timetable',
    title: 'My timetable',
    persona: 'TEACHER',
    tier: 'T2',
    status: 'planned',
    nav: true,
  },
];
