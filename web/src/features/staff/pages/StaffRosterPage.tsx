// Staff roster (M5) — non-teaching staff / authority.
import { Link } from 'react-router-dom';
import { Badge, Button, Card, PageHeader, Spinner, StatCard } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useStaff } from '../api/staffApi';

export default function StaffRosterPage() {
  const { data, isLoading, error } = useStaff();
  const count = data?.staff.length ?? 0;

  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader title="Staff" subtitle="Non-teaching staff and authority. Onboarding creates the login, membership, and profile in one transaction." />

      <div className="grid-stats">
        <StatCard label="Staff (this tenant)" value={count} accent />
        <StatCard label="Isolation" value={<Badge tone="success">RLS on</Badge>} />
      </div>

      <Can permission="staff.onboard">
        <div className="mt-16">
          <Link to="/staff/onboard"><Button>Onboard staff</Button></Link>
        </div>
      </Can>

      <Card className="mt-16">
        {isLoading && <Spinner />}
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        {!isLoading && count === 0 && <p className="muted">No staff yet.</p>}
        {data?.staff.map((s) => (
          <Link to={`/staff/${s.id}`} className="row" key={s.id} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>{s.login_identifier}</span>
            </div>
            {s.designation && <span className="subtle" style={{ fontSize: 12 }}>{s.designation}</span>}
            <Badge tone={s.status === 'ACTIVE' ? 'success' : 'neutral'}>{s.status}</Badge>
          </Link>
        ))}
      </Card>
    </div>
  );
}
