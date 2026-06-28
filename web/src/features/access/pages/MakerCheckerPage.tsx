// Maker-Checker Config (T2 — DESIGNED SCAFFOLD, no backend yet). Sensitive operations
// can require a second person to approve a change before it commits (docs/05-rbac.md).
// This screen previews the policy table; toggles are local-only until the maker-checker
// engine (a Tier-2 guarded-writes feature) lands. The server gate remains authoritative.
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon,
  PageHeader,
  Select,
  type Column,
} from '@/shared/ui';

interface Policy {
  id: string;
  operation: string;
  scope: string;
  approverRole: string;
  enabled: boolean;
}

const SEED: Policy[] = [
  { id: 'p1', operation: 'Void fee payment', scope: 'finance', approverRole: 'Accountant Lead', enabled: true },
  { id: 'p2', operation: 'Edit student admission', scope: 'students', approverRole: 'School Admin', enabled: true },
  { id: 'p3', operation: 'Delete role', scope: 'access', approverRole: 'School Admin', enabled: false },
  { id: 'p4', operation: 'Publish final marks', scope: 'academics', approverRole: 'Examination Officer', enabled: false },
  { id: 'p5', operation: 'Bulk export student data', scope: 'reports', approverRole: 'School Admin', enabled: true },
];

const APPROVERS = ['School Admin', 'Accountant Lead', 'Examination Officer', 'Class Teacher'];

export default function MakerCheckerPage() {
  const [policies, setPolicies] = useState<Policy[]>(SEED);

  function toggle(id: string) {
    setPolicies((prev) => prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)));
  }

  function setApprover(id: string, approverRole: string) {
    setPolicies((prev) => prev.map((p) => (p.id === id ? { ...p, approverRole } : p)));
  }

  const columns: Column<Policy>[] = [
    { header: 'Operation', cell: (p) => <span style={{ fontWeight: 600 }}>{p.operation}</span> },
    { header: 'Scope', cell: (p) => <Badge tone="neutral">{p.scope}</Badge> },
    {
      header: 'Approver role',
      cell: (p) => (
        <Select value={p.approverRole} onChange={(e) => setApprover(p.id, e.target.value)} disabled={!p.enabled}>
          {APPROVERS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      ),
    },
    {
      header: 'Required',
      align: 'right',
      cell: (p) => (
        <Button variant={p.enabled ? 'primary' : 'ghost'} onClick={() => toggle(p.id)}>
          {p.enabled ? 'Approval required' : 'Off'}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Maker-Checker Config"
        subtitle="Require a second approver before sensitive operations commit. Preview only — the approval engine is not yet wired."
      />

      <Card className="mt-16" style={{ borderLeft: '3px solid var(--info)' }}>
        <div className="flex gap-8" style={{ alignItems: 'center' }}>
          <Icon name="help" />
          <span style={{ fontSize: 13 }} className="subtle">
            Scaffold preview — toggles and approver selections are local and do not persist. The server gate
            (requirePermission) remains the hard control until maker-checker ships.
          </span>
        </div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Approval policies</h3>
        <DataTable columns={columns} rows={policies} rowKey={(p) => p.id} />
      </Card>

      <Card className="mt-16">
        <EmptyState
          icon={<Icon name="help" />}
          title="Custom policies"
          desc="Add your own operation → approver mappings here once the maker-checker engine is enabled."
          action={<Button variant="ghost" disabled>Add policy</Button>}
        />
      </Card>
    </div>
  );
}
