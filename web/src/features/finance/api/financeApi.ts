// Typed hooks for the finance slice (M5) — the append-only ledger. The student's
// outstanding is always the DERIVED Σ DEBIT − Σ CREDIT the server returns, never a
// cached balance (docs/database/06-finance.md).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export interface LedgerEntry {
  id: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: number;
  source_type: string;
  source_id: string | null;
  created_at: string;
}

export interface Ledger {
  entries: LedgerEntry[];
  total_debit: number;
  total_credit: number;
  outstanding: number;
}

export interface FeeHead {
  id: string;
  name: string;
  kind: string;
}

export interface InvoiceRow {
  id: string;
  student_id: string;
  status: string;
  issued_at: string;
  due_date: string | null;
}

export interface PaymentRow {
  id: string;
  student_id: string;
  receipt_no: string;
  amount: number;
  method: string;
  status: string;
  paid_at: string;
}

export const financeKeys = {
  ledger: (studentId: string) => ['finance', 'ledger', studentId] as const,
  feeHeads: ['finance', 'fee-heads'] as const,
  invoices: ['finance', 'invoices'] as const,
  payments: ['finance', 'payments'] as const,
};

export function useFeeHeads() {
  return useQuery({
    queryKey: financeKeys.feeHeads,
    queryFn: () => api.get<{ fee_heads: FeeHead[] }>('/api/v1/finance/fee-heads'),
  });
}

export function useCreateFeeHead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; kind: string }) =>
      api.post<{ id: string }>('/api/v1/finance/fee-heads', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.feeHeads }),
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: financeKeys.invoices,
    queryFn: () => api.get<{ invoices: InvoiceRow[] }>('/api/v1/finance/invoices'),
  });
}

export function usePayments() {
  return useQuery({
    queryKey: financeKeys.payments,
    queryFn: () => api.get<{ payments: PaymentRow[] }>('/api/v1/finance/payments'),
  });
}

export function useLedger(studentId: string) {
  return useQuery({
    queryKey: financeKeys.ledger(studentId),
    queryFn: () => api.get<Ledger>(`/api/v1/finance/students/${studentId}/ledger`),
    enabled: !!studentId,
  });
}

export function useIssueInvoice(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { lines: { description: string; amount: number }[]; due_date?: string }) =>
      api.post<{ invoice_id: string }>('/api/v1/finance/invoices', { student_id: studentId, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.ledger(studentId) }),
  });
}

export function useRecordPayment(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { amount: number; method: string }) =>
      api.post<{ payment_id: string; receipt_no: string }>('/api/v1/finance/payments', { student_id: studentId, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.ledger(studentId) }),
  });
}

export function useVoidPayment(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) => api.post<void>(`/api/v1/finance/payments/${paymentId}/void`),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.ledger(studentId) }),
  });
}
