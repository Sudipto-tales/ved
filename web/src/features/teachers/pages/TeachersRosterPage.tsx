// Teacher roster (M5). Same shape as the student roster — different slice, shared rails.
import { Link } from 'react-router-dom';
import { Badge, Button, Card, PageHeader, Spinner, StatCard } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useTeachers } from '../api/teachersApi';

export default function TeachersRosterPage() {
  const { data, isLoading, error } = useTeachers();
  const count = data?.teachers.length ?? 0;

  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader title="Teachers" subtitle="Teaching staff. Onboarding creates the login, membership, and profile in one transaction." />

      <div className="grid-stats">
        <StatCard label="Teachers (this tenant)" value={count} accent />
        <StatCard label="Isolation" value={<Badge tone="success">RLS on</Badge>} />
      </div>

      <Can permission="teacher.onboard">
        <div className="mt-16">
          <Link to="/teachers/onboard"><Button>Onboard teacher</Button></Link>
        </div>
      </Can>

      <Card className="mt-16">
        {isLoading && <Spinner />}
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        {!isLoading && count === 0 && <p className="muted">No teachers yet.</p>}
        {data?.teachers.map((t) => (
          <Link to={`/teachers/${t.id}`} className="row" key={t.id} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600 }}>{t.name}</span>
              <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>{t.login_identifier}</span>
            </div>
            {t.specialization && <span className="subtle" style={{ fontSize: 12 }}>{t.specialization}</span>}
            <Badge tone={t.status === 'ACTIVE' ? 'success' : 'neutral'}>{t.status}</Badge>
          </Link>
        ))}
      </Card>
    </div>
  );
}
