// Public self-registration API — the UNAUTHENTICATED signup flow against the control
// plane (:8080). No platform token involved; these are the same endpoints docs/01 defines
// for a school to onboard itself: pick a plan → register → submit payment proof → poll.
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api';

export interface Plan {
  id: string;
  name: string;
  tier: string;
  currency: string;
  price: number;
  billing_cycle: string;
  seats: number;
  enabled_modules: string[];
}

export interface RegisterInput {
  school_name: string;
  slug: string;
  admin_name: string;
  admin_email: string;
  admin_phone?: string;
  plan_id: string;
  business_reg?: string;
  gst?: string;
  // Answers to superadmin-defined custom fields, keyed by field_key.
  extra?: Record<string, unknown>;
}

// RegFormField mirrors the control-plane registration_field_config row (the dynamic form
// template). The public projection only returns visible fields.
export interface RegFormField {
  field_key: string;
  kind: 'BUILTIN' | 'CUSTOM';
  field_type: 'TEXT' | 'NUMBER' | 'DATE' | 'EMAIL' | 'PHONE' | 'DROPDOWN' | 'FILE';
  label: string;
  help_text: string;
  visible: boolean;
  required: boolean;
  locked: boolean;
  ordinal: number;
  options: { label: string; value: string }[];
}

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

export interface ProofInput {
  amount: number;
  currency?: string;
  method: string;
  txn_id: string;
  payer_name: string;
  paid_at?: string;
}

export function usePlans() {
  return useQuery({
    queryKey: ['signup', 'plans'],
    queryFn: () => api.get<{ plans: Plan[] }>('/api/v1/plans'),
  });
}

export function useRegistrationForm() {
  return useQuery({
    queryKey: ['signup', 'registration-form'],
    queryFn: () => api.get<{ fields: RegFormField[] }>('/api/v1/registration-form'),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (input: RegisterInput) => api.post<Registration>('/api/v1/register', input),
  });
}

export function useSubmitProof(regId: string) {
  return useMutation({
    mutationFn: (input: ProofInput) => api.post<void>(`/api/v1/registrations/${regId}/payment-proof`, input),
  });
}

export function useRegistrationStatus(regId: string, poll = false) {
  return useQuery({
    queryKey: ['signup', 'registration', regId],
    queryFn: () => api.get<Registration>(`/api/v1/registrations/${regId}`),
    enabled: !!regId,
    refetchInterval: poll ? 4000 : false,
  });
}
