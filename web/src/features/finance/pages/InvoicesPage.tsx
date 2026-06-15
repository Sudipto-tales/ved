// Invoices (M5) — recent demand documents (DEBITs). Read-only list; click through to the
// student's append-only ledger. Invoice status is derived on the server, never edited.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Card, DataTable, PageHeader, StatCard, type Column } from '@/shared/ui';
import { useStudents } from '@/features/students/api/studentsApi';
import { useInvoices, type InvoiceRow } from '../api/financeApi';

const STATUS_TONE: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'info'> = {
  DRAFT: 'neutral',
  ISSUED: 'info',
  PARTLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'warning',
  CANCELLED: 'neutral',
};

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString();
}

export default function InvoicesPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useInvoices();
  const { data: studentsData } = useStudents();

  const names = useMemo(() => {
    const m = new Map<string, string>();
    studentsData?.students.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [studentsData]);

  const invoices = data?.invoices ?? [];
  const open = invoices.filter((i) => i.status !== 'PAID' && i.status !== 'CANCELLED').length;

  const columns: Column<InvoiceRow>[] = [
    { header: 'Student', cell: (r) => <span style={{ fontWeight: 600 }}>{names.get(r.student_id) ?? r.student_id.slice(0, 8)}</span> },
    { header: 'Status', cell: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge> },
    { header: 'Issued', cell: (r) => fmtDate(r.issued_at) },
    { header: 'Due', cell: (r) => fmtDate(r.due_date) },
  ];

  return (
    <div style={{ maxWidth: 960 }}>
      <PageHeader title="Invoices" subtitle="Recent demand documents. Click a row to open the student's ledger. Status is derived, never edited." />

      <div className="grid-stats mt-16">
        <StatCard label="Recent invoices" value={invoices.length} accent />
        <StatCard label="Open" value={open} />
        <StatCard label="Paid" value={invoices.filter((i) => i.status === 'PAID').length} />
      </div>

      <Card className="mt-16">
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<InvoiceRow>
          loading={isLoading}
          rows={invoices}
          rowKey={(r) => r.id}
          empty="No invoices issued yet."
          onRowClick={(r) => navigate(`/ledger/${r.student_id}`)}
          columns={columns}
        />
      </Card>
    </div>
  );
}
