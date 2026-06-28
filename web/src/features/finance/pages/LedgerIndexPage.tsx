// Student Ledger index (M5) — pick a student to view their append-only fee ledger.
import { Link } from 'react-router-dom';
import { Badge, Card, PageHeader, Spinner } from '@/shared/ui';
import { useStudents } from '@/features/students/api/studentsApi';

export default function LedgerIndexPage() {
  const { data, isLoading, error } = useStudents();

  return (
    <div>
      <PageHeader title="Student Ledger" subtitle="Append-only, event-sourced fee ledger. Outstanding is always derived (Σ debit − Σ credit), never stored." />
      <Card className="mt-16">
        {isLoading && <Spinner />}
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        {!isLoading && (data?.students.length ?? 0) === 0 && <p className="muted">No students yet. Onboard one first.</p>}
        {data?.students.map((s) => (
          <Link to={`/ledger/${s.id}`} className="row" key={s.id} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>#{s.admission_no}</span>
            </div>
            <Badge tone={s.status === 'ACTIVE' ? 'success' : 'neutral'}>{s.status}</Badge>
          </Link>
        ))}
      </Card>
    </div>
  );
}
