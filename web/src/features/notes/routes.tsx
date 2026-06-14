import type { PageDef } from '@/shared/types/page';

// The demo slice — mirrors the backend `notes` walking-skeleton slice. It is the
// frontend half of the M0 end-to-end proof (FE → API client → node → DB → outbox).
// Remove once a real first slice (students) replaces it.
export const notesPages: PageDef[] = [
  {
    path: 'notes',
    title: 'Notes (demo)',
    persona: 'ADMIN',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./pages/NotesPage'),
  },
];
