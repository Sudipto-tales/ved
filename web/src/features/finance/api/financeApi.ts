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

export const financeKeys = {
  ledger: (studentId: string) => ['finance', 'ledger', studentId] as const,
};

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
