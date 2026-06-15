// Invoice detail (M5) — minimal. There is no per-invoice GET yet, so we surface the
// summary from the recent-invoices list and route the user to the student ledger for the
// authoritative, append-only line history. A designed scaffold until /invoices/:id lands.
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Icon, PageHeader, Spinner, StatCard } from '@/shared/ui';
import { useStudents } from '@/features/students/api/studentsApi';
import { useInvoices } from '../api/financeApi';

const STATUS_TONE: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'info'> = {
  DRAFT: 'neutral', ISSUED: 'info', PARTLY_PAID: 'warning', PAID: 'success', OVERDUE: 'warning', CANCELLED: 'neutral',
};

export default function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading } = useInvoices();
  const { data: studentsData } = useStudents();

  const invoice = useMemo(() => data?.invoices.find((i) => i.id === id), [data, id]);
  const studentName = invoice
    ? studentsData?.students.find((s) => s.id === invoice.student_id)?.name
    : undefined;

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader title="Invoice" subtitle="Read-only demand document. Line-level detail lives in the student's append-only ledger." />
      <Link to="/invoices" className="subtle" style={{ fontSize: 13 }}>← Back to invoices</Link>

      {isLoading && <div className="mt-16"><Spinner /></div>}

      {!isLoading && !invoice && (
        <Card className="mt-16">
          <EmptyState
            icon={<Icon name="note" />}
            title="Invoice not in the recent set"
            desc="A dedicated per-invoice endpoint isn't available yet. Open the student ledger to see every charge and payment."
          />
        </Card>
      )}

      {invoice && (
        <>
          <div className="grid-stats mt-16">
            <StatCard label="Status" value={<Badge tone={STATUS_TONE[invoice.status] ?? 'neutral'}>{invoice.status}</Badge>} accent />
            <StatCard label="Issued" value={new Date(invoice.issued_at).toLocaleDateString()} />
            <StatCard label="Due" value={invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—'} />
          </div>

          <Card className="mt-16">
            <div className="between">
              <div>
                <div className="muted" style={{ fontSize: 12 }}>Student</div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{studentName ?? invoice.student_id}</div>
              </div>
              <Link to={`/ledger/${invoice.student_id}`}>
                <Button variant="secondary">Open ledger</Button>
              </Link>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
