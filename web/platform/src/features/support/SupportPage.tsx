// Support Console — DESIGNED SCAFFOLD. No support backend yet; this lays out the intended
// triage surface (ticket queue + filters) with illustrative rows so the shape is real.
import { useState } from 'react';
import { Badge, Card, DataTable, EmptyState, Field, Icon, PageHeader, Select, StatCard, Tabs } from '@/shared/ui';

interface Ticket {
  id: string;
  school: string;
  subject: string;
  priority: 'low' | 'normal' | 'high';
  status: 'open' | 'pending' | 'resolved';
  updated: string;
}

// Illustrative data — replaced when a support/ticketing service is wired.
const SAMPLE: Ticket[] = [
  { id: 'T-1042', school: 'Sunrise Public School', subject: 'Cannot reset admin password', priority: 'high', status: 'open', updated: '2026-06-14' },
  { id: 'T-1041', school: 'Greenfield College', subject: 'Sync paused after power outage', priority: 'normal', status: 'pending', updated: '2026-06-13' },
  { id: 'T-1039', school: 'Lakeview Academy', subject: 'Invoice numbering question', priority: 'low', status: 'resolved', updated: '2026-06-12' },
];

const PRIORITY_TONE: Record<Ticket['priority'], 'warning' | 'neutral' | 'info'> = { high: 'warning', normal: 'neutral', low: 'info' };
const STATUS_TONE: Record<Ticket['status'], 'primary' | 'warning' | 'success'> = { open: 'primary', pending: 'warning', resolved: 'success' };

export default function SupportPage() {
  const [tab, setTab] = useState<'open' | 'all'>('open');
  const rows = tab === 'open' ? SAMPLE.filter((t) => t.status !== 'resolved') : SAMPLE;

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader title="Support Console" subtitle="Triage school support requests across the network. Scaffold — no ticketing backend yet; rows are illustrative." />

      <div className="grid-stats mt-16">
        <StatCard label="Open" value={SAMPLE.filter((t) => t.status === 'open').length} accent />
        <StatCard label="Pending" value={SAMPLE.filter((t) => t.status === 'pending').length} />
        <StatCard label="Resolved (7d)" value={SAMPLE.filter((t) => t.status === 'resolved').length} />
        <StatCard label="Avg first response" value="2h 14m" />
      </div>

      <div className="toolbar mt-16">
        <Tabs<'open' | 'all'> tabs={[{ id: 'open', label: 'Open' }, { id: 'all', label: 'All' }]} active={tab} onChange={setTab} />
        <span className="grow" style={{ flex: 1 }} />
        <Field label="">
          <Select defaultValue="all" disabled title="Filtering lands with the support backend">
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </Select>
        </Field>
      </div>

      <Card className="mt-16">
        <DataTable<Ticket>
          rows={rows}
          rowKey={(t) => t.id}
          empty={<EmptyState icon={<Icon name="help" />} title="No tickets" desc="Nothing in this queue." />}
          columns={[
            { header: 'Ticket', cell: (t) => <code>{t.id}</code> },
            { header: 'School', cell: (t) => <span style={{ fontWeight: 600 }}>{t.school}</span> },
            { header: 'Subject', cell: (t) => t.subject },
            { header: 'Priority', cell: (t) => <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge> },
            { header: 'Status', cell: (t) => <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge> },
            { header: 'Updated', align: 'right', cell: (t) => new Date(t.updated).toLocaleDateString() },
          ]}
        />
      </Card>

      <p className="subtle" style={{ fontSize: 12, marginTop: 12 }}>
        <Icon name="help" size={13} /> A ticketing/inbox service (and per-school context links) replaces this scaffold when support is built.
      </p>
    </div>
  );
}
