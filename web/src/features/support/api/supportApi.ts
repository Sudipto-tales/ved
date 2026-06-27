// Support slice FE surface — the school side. Thin react-query hooks over the tenant
// support endpoints (server/internal/features/support). Tickets sync to the platform's
// Support Console; replies sync back here.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export interface SupportTicket {
  id: string;
  subject: string;
  priority: 'low' | 'normal' | 'high';
  status: 'open' | 'pending' | 'resolved';
  last_message_at: string;
  created_at: string;
  message_count: number;
}
export interface SupportMessage {
  id: string;
  ticket_id: string;
  author_type: 'SCHOOL' | 'PLATFORM';
  author_name: string;
  body: string;
  created_at: string;
}
export interface SupportThread {
  ticket: SupportTicket;
  messages: SupportMessage[];
}

const keys = {
  all: ['support'] as const,
  list: ['support', 'tickets'] as const,
  ticket: (id: string) => ['support', 'ticket', id] as const,
};

export function useSupportTickets() {
  return useQuery({
    queryKey: keys.list,
    queryFn: () => api.get<{ tickets: SupportTicket[] }>('/api/v1/support/tickets'),
  });
}

export function useSupportTicket(id: string) {
  return useQuery({
    queryKey: keys.ticket(id),
    queryFn: () => api.get<SupportThread>(`/api/v1/support/tickets/${id}`),
    enabled: !!id,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { subject: string; priority?: string; body: string }) =>
      api.post<SupportThread>('/api/v1/support/tickets', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useAddMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.post<SupportThread>(`/api/v1/support/tickets/${id}/messages`, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}
