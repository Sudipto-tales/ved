// Typed query/mutation hooks for the notes slice — the pattern every feature's api/
// folder follows: thin hooks over @/shared/api/client + queryKeys. No component
// calls fetch directly.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/queryKeys';

export interface Note {
  id: string;
  body: string;
  created_at: string;
}

export function useNotes() {
  return useQuery({
    queryKey: queryKeys.notes,
    queryFn: () => api.get<{ notes: Note[] }>('/api/v1/notes'),
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.post<Note>('/api/v1/notes', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notes }),
  });
}
