// Guardian dashboard (M7) — the multi-child switcher. One login → every linked child,
// each a gateway to that child's attendance and fees. The list IS the security boundary:
// the server only ever returns this guardian's own children.
import { Link } from 'react-router-dom';
import { Badge, Card, PageHeader, Spinner } from '@/shared/ui';
import { useChildren } from '../api/guardianApi';

export default function GuardianDashboard() {
  const { data, isLoading, error } = useChildren();
  const children = data?.children ?? [];

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader title="My children" subtitle="Everything here is scoped to your own children — attendance, marks, and fees as the school records them." />
      <Card className="mt-16">
        {isLoading && <Spinner />}
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        {!isLoading && children.length === 0 && <p className="muted">No children linked to your account yet.</p>}
        {children.map((c) => (
          <div className="row" key={c.student_id}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>#{c.admission_no} · {c.relation}</span>
            </div>
            {c.is_primary && <Badge tone="neutral">primary</Badge>}
            <Link to={`/guardian/children/${c.student_id}/attendance`} className="subtle" style={{ fontSize: 13 }}>Attendance</Link>
            <Link to={`/guardian/children/${c.student_id}/fees`} className="subtle" style={{ fontSize: 13 }}>Fees</Link>
          </div>
        ))}
      </Card>
    </div>
  );
}
