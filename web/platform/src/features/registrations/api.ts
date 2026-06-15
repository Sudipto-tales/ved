import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api';

export interface Registration {
  id: string;
  school_name: string;
  slug: string;
  admin_name: string;
  admin_email: string;
  status: string;
  proof_status?: string | null;
  tenant_id?: string | null;
  created_at: string;
}

export interface ApproveResult {
  tenant_id: string;
  slug: string;
  invoice_number: string;
  license_id: string;
  admin_login: string;
  admin_temp_password: string;
  license_expires_at: string;
}

const KEY = ['platform', 'registrations'] as const;

export function useRegistrations() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<{ registrations: Registration[] }>('/api/v1/platform/registrations'),
  });
}

export function useApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApproveResult>(`/api/v1/platform/registrations/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<void>(`/api/v1/platform/registrations/${id}/reject`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
