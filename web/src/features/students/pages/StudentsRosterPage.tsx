// Student roster (M3) — the tenant's admitted students, RLS-scoped server-side. Links
// to the onboarding wizard and to each student's detail.
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
import { useStudents, type StudentRow } from '../api/studentsApi';

export default function StudentsRosterPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useStudents();
  const students = data?.students ?? [];
  const count = students.length;

  const columns: Column<StudentRow>[] = [
    {
      header: 'Name',
      cell: (s) => (
        <div>
          <span style={{ fontWeight: 600 }}>{s.name}</span>
          <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>{s.login_identifier}</span>
        </div>
      ),
    },
    { header: 'Admission', cell: (s) => <span className="subtle" style={{ fontSize: 12 }}>#{s.admission_no}</span> },
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
              navigate(`/students/${s.id}`);
            }}
          >
            <Icon name="eye" />
          </button>
        </span>
      ),
    },
  ];

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
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<StudentRow>
          columns={columns}
          rows={students}
          rowKey={(s) => s.id}
          loading={isLoading}
          searchable
          searchText={(s) => `${s.name} ${s.admission_no} ${s.login_identifier} ${s.status} ${s.gender ?? ''}`}
          onRowClick={(s) => navigate(`/students/${s.id}`)}
          empty={
            <EmptyState
              icon={<Icon name="users" size={28} />}
              title="No students yet"
              desc="Onboard the first one."
            />
          }
        />
      </Card>
    </div>
  );
}
