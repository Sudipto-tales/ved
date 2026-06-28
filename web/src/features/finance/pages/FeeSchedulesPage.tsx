// Fee Schedules (M5 scaffold) — installment plans / due-date calendars that drive when
// invoices auto-issue (monthly, term, annual). Backing tables aren't built; designed
// shell with a local draft list.
import { useState } from 'react';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, Select, StatCard, type Column } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';

const CADENCES = ['MONTHLY', 'TERM', 'ANNUAL'];

interface DraftSchedule {
  id: string;
  name: string;
  cadence: string;
  installments: number;
}

export default function FeeSchedulesPage() {
  const [drafts, setDrafts] = useState<DraftSchedule[]>([]);
  const [name, setName] = useState('');
  const [cadence, setCadence] = useState('MONTHLY');
  const [installments, setInstallments] = useState('12');

  function add() {
    if (!name.trim()) return;
    setDrafts((d) => [...d, { id: crypto.randomUUID(), name: name.trim(), cadence, installments: Number(installments) || 0 }]);
    setName('');
  }

  const columns: Column<DraftSchedule>[] = [
    { header: 'Schedule', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { header: 'Cadence', cell: (r) => <Badge tone="info">{r.cadence}</Badge> },
    { header: 'Installments', align: 'right', cell: (r) => r.installments },
  ];

  return (
    <div>
      <PageHeader title="Fee Schedules" subtitle="Installment plans and due-date calendars that auto-issue invoices on a cadence." />
      <Badge tone="warning">Preview — backing tables land in a later milestone</Badge>

      <div className="grid-stats mt-16">
        <StatCard label="Schedules" value={drafts.length} accent />
        <StatCard label="Monthly" value={drafts.filter((d) => d.cadence === 'MONTHLY').length} />
        <StatCard label="Term/Annual" value={drafts.filter((d) => d.cadence !== 'MONTHLY').length} />
      </div>

      <Can permission="fee.manage">
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>New schedule (draft)</h3>
          <div className="flex gap-8" style={{ alignItems: 'flex-end' }}>
            <Field label="Name">
              <input className="input" placeholder="e.g. Monthly tuition" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Cadence">
              <Select value={cadence} onChange={(e) => setCadence(e.target.value)}>
                {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Installments">
              <input className="input" inputMode="numeric" value={installments} onChange={(e) => setInstallments(e.target.value)} style={{ maxWidth: 110 }} />
            </Field>
            <Button disabled={!name.trim()} onClick={add}>Add draft</Button>
          </div>
        </Card>
      </Can>

      <Card className="mt-16">
        {drafts.length === 0 ? (
          <EmptyState icon={<Icon name="chart" />} title="No schedules yet" desc="Configure a cadence to auto-issue invoices on time, every time." />
        ) : (
          <DataTable<DraftSchedule> rows={drafts} rowKey={(r) => r.id} columns={columns} />
        )}
      </Card>
    </div>
  );
}
