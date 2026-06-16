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

// Generated types, re-exported under the names this slice's pages already use.
export type Registration = GenRegistration;
export type PaymentProof = Proof;
export type RegistrationDetail = GenRegistrationDetail;
export type ApproveResult = GenApproveResult;

const KEY = ['platform', 'registrations'] as const;

export function useRegistrations() {
  return useQuery({ queryKey: KEY, queryFn: ({ signal }) => listRegistrations(signal) });
}

export function useRegistration(id: string) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: ({ signal }) => getRegistrationDetail(id, signal),
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
    mutationFn: (id: string) => approveRegistration(id),
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
