// Staff roster (M5) — non-teaching staff / authority.
import { Link, useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon,
  PageHeader,
  StatCard,
  type Column,
} from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useStaff, type StaffRow } from '../api/staffApi';

export default function StaffRosterPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useStaff();
  const staff = data?.staff ?? [];
  const count = staff.length;

  const columns: Column<StaffRow>[] = [
    {
      header: 'Name',
      cell: (s) => (
        <div>
          <span style={{ fontWeight: 600 }}>{s.name}</span>
          <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>{s.login_identifier}</span>
        </div>
      ),
    },
    {
      header: 'Designation',
      cell: (s) => (s.designation ? <span className="subtle" style={{ fontSize: 12 }}>{s.designation}</span> : <span className="muted">—</span>),
    },
    {
      header: 'Status',
      cell: (s) => <Badge tone={s.status === 'ACTIVE' ? 'success' : 'neutral'}>{s.status}</Badge>,
    },
    {
      header: '',
      align: 'right',
      cell: (s) => (
        <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="icon-btn"
            title="View"
            aria-label="View"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/staff/${s.id}`);
            }}
          >
            <Icon name="eye" />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div>
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
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<StaffRow>
          columns={columns}
          rows={staff}
          rowKey={(s) => s.id}
          loading={isLoading}
          searchable
          searchText={(s) => `${s.name} ${s.login_identifier} ${s.department ?? ''} ${s.designation ?? ''} ${s.status}`}
          onRowClick={(s) => navigate(`/staff/${s.id}`)}
          empty={
            <EmptyState
              icon={<Icon name="users" size={28} />}
              title="No staff yet"
              desc="Onboard the first one."
            />
          }
        />
      </Card>
    </div>
  );
}
