// Pending approvals (DESIGNED SCAFFOLD, gated onboarding.approve). When onboarding runs in
// a maker-checker mode, submitted records queue here for a second person to approve before
// the membership goes ACTIVE. Approve/reject are local; the approval engine is not yet wired.
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon,
  PageHeader,
  Tabs,
  type Column,
} from '@/shared/ui';

interface Approval {
  id: string;
  name: string;
  type: 'Student' | 'Teacher' | 'Staff';
  submittedBy: string;
  submittedAt: string;
}

const SEED: Approval[] = [
  { id: 'a1', name: 'Riya Sharma', type: 'Student', submittedBy: 'admissions.officer', submittedAt: '2026-06-14' },
  { id: 'a2', name: 'Anil Mehta', type: 'Teacher', submittedBy: 'hr.lead', submittedAt: '2026-06-14' },
  { id: 'a3', name: 'Sunita Rao', type: 'Staff', submittedBy: 'hr.lead', submittedAt: '2026-06-13' },
];

type Tab = 'pending' | 'resolved';

export default function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending] = useState<Approval[]>(SEED);
  const [resolved, setResolved] = useState<(Approval & { decision: 'Approved' | 'Rejected' })[]>([]);

  function decide(a: Approval, decision: 'Approved' | 'Rejected') {
    setPending((prev) => prev.filter((p) => p.id !== a.id));
    setResolved((prev) => [{ ...a, decision }, ...prev]);
  }

  const pendingColumns: Column<Approval>[] = [
    { header: 'Name', cell: (a) => <span style={{ fontWeight: 600 }}>{a.name}</span> },
    { header: 'Type', cell: (a) => <Badge tone="info">{a.type}</Badge> },
    { header: 'Submitted by', cell: (a) => <span className="subtle">{a.submittedBy}</span> },
    { header: 'On', cell: (a) => <span className="subtle">{a.submittedAt}</span> },
    {
      header: '',
      align: 'right',
      cell: (a) => (
        <div className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => decide(a, 'Approved')}>Approve</Button>
          <Button variant="ghost" onClick={() => decide(a, 'Rejected')}>
            Reject
          </Button>
        </div>
      ),
    },
  ];

  const resolvedColumns: Column<Approval & { decision: string }>[] = [
    { header: 'Name', cell: (a) => <span style={{ fontWeight: 600 }}>{a.name}</span> },
    { header: 'Type', cell: (a) => <Badge tone="neutral">{a.type}</Badge> },
    {
      header: 'Decision',
      cell: (a) => <Badge tone={a.decision === 'Approved' ? 'success' : 'warning'}>{a.decision}</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Pending approvals"
        subtitle="Submitted onboarding records awaiting a second approver. Preview only — decisions are local until the approval engine is wired."
      />

      <div className="mt-16">
        <Tabs<Tab>
          tabs={[
            { id: 'pending', label: `Pending (${pending.length})` },
            { id: 'resolved', label: `Resolved (${resolved.length})` },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <Card className="mt-16">
        {tab === 'pending' ? (
          pending.length === 0 ? (
            <EmptyState
              icon={<Icon name="shield" />}
              title="No pending approvals"
              desc="Onboarding submissions awaiting review will appear here."
            />
          ) : (
            <DataTable columns={pendingColumns} rows={pending} rowKey={(a) => a.id} />
          )
        ) : resolved.length === 0 ? (
          <EmptyState icon={<Icon name="shield" />} title="Nothing resolved yet" desc="Approved and rejected items will appear here." />
        ) : (
          <DataTable columns={resolvedColumns} rows={resolved} rowKey={(a) => a.id} />
        )}
      </Card>
    </div>
  );
}
