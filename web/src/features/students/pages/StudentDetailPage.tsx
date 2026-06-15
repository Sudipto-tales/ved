// Student detail (M3) — the admission record + linked guardians, RLS-scoped.
import { Link, useParams } from 'react-router-dom';
import { Badge, Card, PageHeader, Spinner } from '@/shared/ui';
import { useStudent } from '../api/studentsApi';

export default function StudentDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useStudent(id);

  if (isLoading) return <div style={{ padding: 24 }}><Spinner /></div>;
  if (error) return <p style={{ color: 'var(--danger)', padding: 24 }}>Failed to load: {String(error)}</p>;
  if (!data) return null;

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader title={data.name} subtitle={`Admission #${data.admission_no}`} />
      <Link to="/students" className="subtle" style={{ fontSize: 13 }}>← Back to roster</Link>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Identity</h3>
        <div className="row"><span className="muted">Login</span><code>{data.login_identifier}</code></div>
        <div className="row"><span className="muted">Status</span><Badge tone={data.status === 'ACTIVE' ? 'success' : 'neutral'}>{data.status}</Badge></div>
        {data.gender && <div className="row"><span className="muted">Gender</span><span>{data.gender}</span></div>}
        {data.dob && <div className="row"><span className="muted">Date of birth</span><span>{data.dob}</span></div>}
        {data.prior_school && <div className="row"><span className="muted">Prior school</span><span>{data.prior_school}</span></div>}
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Guardians</h3>
        {data.guardians.length === 0 && <p className="muted">No guardians linked.</p>}
        {data.guardians.map((g) => (
          <div className="row" key={g.id}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600 }}>{g.name}</span>
              <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>{g.relation}</span>
            </div>
            <span className="subtle" style={{ fontSize: 12 }}>{g.phone}</span>
            {g.is_primary && <Badge tone="neutral">primary</Badge>}
            {g.can_pay && <Badge tone="success">can pay</Badge>}
          </div>
        ))}
      </Card>
    </div>
  );
}
