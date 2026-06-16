// Finance slice FE surface (M5) — the append-only ledger. Types + HTTP calls are
// GENERATED from the frozen OpenAPI spec (server/api/openapi) via `npm run gen:api`.
// The student's outstanding is always the DERIVED Σ DEBIT − Σ CREDIT the server returns,
// never a cached balance (docs/database/06-finance.md). See studentsApi.ts for the pattern.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listFeeHeads,
  createFeeHead,
  listInvoices,
  issueInvoice,
  listPayments,
  recordPayment,
  voidPayment,
  getStudentLedger,
} from '@/shared/api/generated/finance/finance';
import type {
  ListFeeHeads200FeeHeadsItem,
  ListInvoices200InvoicesItem,
  ListPayments200PaymentsItem,
  GetStudentLedger200,
  GetStudentLedger200EntriesItem,
} from '@/shared/api/generated/model';

// Generated types, re-exported under the names this slice's components already use.
export type FeeHead = ListFeeHeads200FeeHeadsItem;
export type InvoiceRow = ListInvoices200InvoicesItem;
export type PaymentRow = ListPayments200PaymentsItem;
export type Ledger = GetStudentLedger200;
export type LedgerEntry = GetStudentLedger200EntriesItem;

export const financeKeys = {
  ledger: (studentId: string) => ['finance', 'ledger', studentId] as const,
  feeHeads: ['finance', 'fee-heads'] as const,
  invoices: ['finance', 'invoices'] as const,
  payments: ['finance', 'payments'] as const,
};

export function useFeeHeads() {
  return useQuery({
    queryKey: financeKeys.feeHeads,
    queryFn: ({ signal }) => listFeeHeads(signal),
  });
}

export function useCreateFeeHead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; kind: string }) => createFeeHead(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.feeHeads }),
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: financeKeys.invoices,
    queryFn: ({ signal }) => listInvoices(signal),
  });
}

export function usePayments() {
  return useQuery({
    queryKey: financeKeys.payments,
    queryFn: ({ signal }) => listPayments(signal),
  });
}

export function useLedger(studentId: string) {
  return useQuery({
    queryKey: financeKeys.ledger(studentId),
    queryFn: ({ signal }) => getStudentLedger(studentId, signal),
    enabled: !!studentId,
  });
}

export function useIssueInvoice(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { lines: { description: string; amount: number }[]; due_date?: string }) =>
      issueInvoice({ student_id: studentId, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.ledger(studentId) }),
  });
}

export function useRecordPayment(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { amount: number; method: string }) =>
      recordPayment({ student_id: studentId, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.ledger(studentId) }),
  });
}

export function useVoidPayment(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) => voidPayment(paymentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.ledger(studentId) }),
  });
}
