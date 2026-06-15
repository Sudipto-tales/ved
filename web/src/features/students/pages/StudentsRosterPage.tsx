// Student roster (M3) — the tenant's admitted students, RLS-scoped server-side. Links
// to the onboarding wizard and to each student's detail.
import { Link } from 'react-router-dom';
import { Badge, Button, Card, PageHeader, Spinner, StatCard } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useStudents } from '../api/studentsApi';

export default function StudentsRosterPage() {
  const { data, isLoading, error } = useStudents();
  const count = data?.students.length ?? 0;

  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader
        title="Students"
        subtitle="Admission records for this school. Onboarding creates the login, membership, profile, and guardian links in one transaction."
      />

      <div className="grid-stats">
        <StatCard label="Students (this tenant)" value={count} accent />
        <StatCard label="Isolation" value={<Badge tone="success">RLS on</Badge>} />
      </div>

      <Can permission="student.onboard">
        <div className="mt-16">
          <Link to="/students/onboard">
            <Button>Onboard student</Button>
          </Link>
        </div>
      </Can>

      <Card className="mt-16">
        {isLoading && <Spinner />}
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        {!isLoading && count === 0 && <p className="muted">No students yet. Onboard the first one.</p>}
        {data?.students.map((s) => (
          <Link to={`/students/${s.id}`} className="row" key={s.id} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>{s.login_identifier}</span>
            </div>
            <span className="subtle" style={{ fontSize: 12 }}>#{s.admission_no}</span>
            <Badge tone={s.status === 'ACTIVE' ? 'success' : 'neutral'}>{s.status}</Badge>
          </Link>
        ))}
      </Card>
    </div>
  );
}
