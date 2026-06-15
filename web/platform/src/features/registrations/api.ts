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

export interface PaymentProof {
  id: string;
  registration_id: string;
  school_name: string;
  slug: string;
  amount: number;
  currency: string;
  method: string;
  txn_id: string;
  payer_name?: string | null;
  paid_at?: string | null;
  storage_key?: string | null;
  status: string;
  reject_reason?: string | null;
  created_at: string;
}

export interface RegistrationDetail {
  registration: Registration;
  proof?: PaymentProof | null;
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

// Single-registration detail (registration + its latest payment proof). Backed by the
// optional GET /api/v1/platform/registrations/{id} endpoint.
export function useRegistration(id: string) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => api.get<RegistrationDetail>(`/api/v1/platform/registrations/${id}`),
    enabled: !!id,
  });
}

const PROOFS_KEY = ['platform', 'payment-proofs'] as const;

// Pending payment proofs joined to their registration — the review queue.
export function usePaymentProofs() {
  return useQuery({
    queryKey: PROOFS_KEY,
    queryFn: () => api.get<{ payment_proofs: PaymentProof[] }>('/api/v1/platform/payment-proofs'),
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
  qc.invalidateQueries({ queryKey: PROOFS_KEY });
}

export function useApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApproveResult>(`/api/v1/platform/registrations/${id}/approve`),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<void>(`/api/v1/platform/registrations/${id}/reject`, { reason }),
    onSuccess: () => invalidateAll(qc),
  });
}
