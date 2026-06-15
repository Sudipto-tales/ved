// Financial Audit Trail (M5 scaffold) — an immutable, filterable feed of every finance
// mutation (invoice issued, payment recorded, payment voided). Every write already lands
// in the platform audit table; a dedicated finance-audit query endpoint isn't exposed yet,
// so this is the designed shell with a filter toolbar + table header.
import { useState } from 'react';
import { Badge, Card, DataTable, EmptyState, Icon, PageHeader, Select, Toolbar, type Column } from '@/shared/ui';

const ACTIONS = ['ALL', 'invoice.issued', 'payment.recorded', 'payment.voided', 'fee_head.create'];

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  actor: string;
  at: string;
}

export default function AuditTrailPage() {
  const [action, setAction] = useState('ALL');
  const rows: AuditRow[] = []; // populated once GET /finance/audit lands

  const columns: Column<AuditRow>[] = [
    { header: 'When', cell: (r) => new Date(r.at).toLocaleString() },
    { header: 'Action', cell: (r) => <Badge tone="info">{r.action}</Badge> },
    { header: 'Entity', cell: (r) => <span className="muted">{r.entity}</span> },
    { header: 'Actor', cell: (r) => r.actor },
  ];

  return (
    <div style={{ maxWidth: 960 }}>
      <PageHeader title="Financial Audit Trail" subtitle="Every finance mutation is recorded immutably (row + outbox + audit, one tx). This view surfaces that trail." />
      <Badge tone="warning">Preview — a finance-audit query endpoint lands in a later milestone</Badge>

      <Toolbar>
        <Select value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTIONS.map((a) => <option key={a} value={a}>{a === 'ALL' ? 'All actions' : a}</option>)}
        </Select>
      </Toolbar>

      <Card className="mt-16">
        <DataTable<AuditRow>
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={<Icon name="shield" />} title="No audit records to show" desc="Finance events will stream here once the audit query endpoint is wired." />}
          columns={columns}
        />
      </Card>
    </div>
  );
}
