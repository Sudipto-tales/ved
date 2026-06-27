// Teacher roster (M5). Same shape as the student roster — different slice, shared rails.
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
import { useTeachers, type TeacherRow } from '../api/teachersApi';

export default function TeachersRosterPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useTeachers();
  const teachers = data?.teachers ?? [];
  const count = teachers.length;

  const columns: Column<TeacherRow>[] = [
    {
      header: 'Name',
      cell: (t) => (
        <div>
          <span style={{ fontWeight: 600 }}>{t.name}</span>
          <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>{t.login_identifier}</span>
        </div>
      ),
    },
    {
      header: 'Specialization',
      cell: (t) => (t.specialization ? <span className="subtle" style={{ fontSize: 12 }}>{t.specialization}</span> : <span className="muted">—</span>),
    },
    {
      header: 'Status',
      cell: (t) => <Badge tone={t.status === 'ACTIVE' ? 'success' : 'neutral'}>{t.status}</Badge>,
    },
    {
      header: '',
      align: 'right',
      cell: (t) => (
        <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="icon-btn"
            title="View"
            aria-label="View"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/teachers/${t.id}`);
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
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<TeacherRow>
          columns={columns}
          rows={teachers}
          rowKey={(t) => t.id}
          loading={isLoading}
          searchable
          searchText={(t) => `${t.name} ${t.login_identifier} ${t.employee_code ?? ''} ${t.specialization ?? ''} ${t.status}`}
          onRowClick={(t) => navigate(`/teachers/${t.id}`)}
          empty={
            <EmptyState
              icon={<Icon name="users" size={28} />}
              title="No teachers yet"
              desc="Onboard the first one."
            />
          }
        />
      </Card>
    </div>
  );
}
