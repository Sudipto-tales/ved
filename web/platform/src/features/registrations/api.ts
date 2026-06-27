// Platform registrations FE surface — GENERATED from the control-plane OpenAPI spec
// (server/api/openapi/controlplane.yaml) via `npm run gen:api`. Hook names/signatures
// unchanged so the pages need no edits. See web/src/features/students/api/studentsApi.ts.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listRegistrations,
  getRegistrationDetail,
  listPaymentProofs,
  approveRegistration,
  rejectRegistration,
} from '../../shared/generated/platform/platform';
import type {
  Registration as GenRegistration,
  Proof,
  RegistrationDetail as GenRegistrationDetail,
  ApproveResult as GenApproveResult,
} from '../../shared/generated/model';

// M11: the control plane now enriches registrations with KYC / risk / source. These fields
// aren't in the frozen OpenAPI model yet, so we augment the generated types locally rather
// than hand-edit the generated files (regen-safe). See platform_v2.go.
export interface RegistrationKYC {
  status: string;
  business_reg?: string | null;
  gst?: string | null;
  notes?: string | null;
  risk_score: number;
  risk_factors: string[];
  source: string;
  source_detail?: string | null;
}

// Generated types, re-exported under the names this slice's pages already use.
export type Registration = GenRegistration & {
  kyc_status?: string | null;
  /** Coarse band: LOW | MEDIUM | HIGH. */
  risk_score?: string | null;
  source?: string | null;
};
export type PaymentProof = Proof;
export type RegistrationDetail = GenRegistrationDetail & { kyc?: RegistrationKYC | null };
export type ApproveResult = GenApproveResult & { magic_token?: string | null };

const KEY = ['platform', 'registrations'] as const;

export function useRegistrations() {
  return useQuery({
    queryKey: KEY,
    // The control plane returns the M11-augmented rows (kyc_status / risk_score / source);
    // the generated client type predates them, so re-type via the augmented alias.
    queryFn: ({ signal }) => listRegistrations(signal) as Promise<{ registrations: Registration[] }>,
  });
}

export function useRegistration(id: string) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: ({ signal }) => getRegistrationDetail(id, signal) as Promise<RegistrationDetail>,
    enabled: !!id,
  });
}

const PROOFS_KEY = ['platform', 'payment-proofs'] as const;

export function usePaymentProofs() {
  return useQuery({ queryKey: PROOFS_KEY, queryFn: ({ signal }) => listPaymentProofs(signal) });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
  qc.invalidateQueries({ queryKey: PROOFS_KEY });
}

export function useApprove() {
  const qc = useQueryClient();
  return useMutation({
    // ApproveResult is augmented with the optional magic_token (one-click activation link).
    mutationFn: (id: string) => approveRegistration(id) as Promise<ApproveResult>,
    onSuccess: () => invalidateAll(qc),
  });
}

export function useReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectRegistration(id, { reason }),
    onSuccess: () => invalidateAll(qc),
  });
}
