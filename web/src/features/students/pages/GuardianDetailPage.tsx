// Guardian detail (record management) — the contact record + its linked children,
// RLS-scoped. Read-only; promotion to portal access happens from the directory.
import { Link, useParams } from 'react-router-dom';
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  Icon,
  PageHeader,
  Spinner,
  type Column,
} from '@/shared/ui';
import { useGuardian, type GuardianChild } from '../api/studentsApi';

export default function GuardianDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useGuardian(id);

  if (isLoading) return <div style={{ padding: 24 }}><Spinner /></div>;
  if (error) return <p style={{ color: 'var(--danger)', padding: 24 }}>Failed to load: {String(error)}</p>;
  if (!data) return null;

  const columns: Column<GuardianChild>[] = [
    {
      header: 'Student',
      cell: (c) => (
        <Link to={`/students/${c.student_id}`} style={{ fontWeight: 600 }}>{c.name}</Link>
      ),
    },
    { header: 'Admission', cell: (c) => <span className="subtle">#{c.admission_no}</span> },
    { header: 'Relation', cell: (c) => <Badge tone="neutral">{c.relation}</Badge> },
    {
      header: 'Flags',
      align: 'right',
      cell: (c) => (
        <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
          {c.is_primary && <Badge tone="neutral">primary</Badge>}
          {c.can_pay && <Badge tone="success">can pay</Badge>}
        </span>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader title={data.name} subtitle="Guardian record" />
      <Link to="/guardians" className="subtle" style={{ fontSize: 13 }}>← Back to guardians</Link>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Contact</h3>
        <div className="row"><span className="muted">Phone</span><span>{data.phone}</span></div>
        {data.email && <div className="row"><span className="muted">Email</span><span>{data.email}</span></div>}
        {data.occupation && <div className="row"><span className="muted">Occupation</span><span>{data.occupation}</span></div>}
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Linked children</h3>
        <DataTable<GuardianChild>
          columns={columns}
          rows={data.children}
          rowKey={(c) => c.student_id}
          empty={
            <EmptyState
              icon={<Icon name="graduation" size={28} />}
              title="No linked students"
              desc="This guardian is not linked to any active student."
            />
          }
        />
      </Card>
    </div>
  );
}
