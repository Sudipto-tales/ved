// Concessions & Scholarships (M5 scaffold) — discounts that reduce a student's net dues
// (sibling, merit, staff-ward, need-based). Recorded as CONCESSION ledger entries when the
// backing tables exist. Designed shell with a local draft list.
import { useState } from 'react';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, Select, StatCard, type Column } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';

const TYPES = ['SIBLING', 'MERIT', 'STAFF_WARD', 'NEED_BASED', 'OTHER'];

interface DraftConcession {
  id: string;
  name: string;
  type: string;
  percent: number;
}

export default function ConcessionsPage() {
  const [drafts, setDrafts] = useState<DraftConcession[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('MERIT');
  const [percent, setPercent] = useState('10');

  function add() {
    if (!name.trim()) return;
    setDrafts((d) => [...d, { id: crypto.randomUUID(), name: name.trim(), type, percent: Number(percent) || 0 }]);
    setName('');
  }

  const columns: Column<DraftConcession>[] = [
    { header: 'Concession', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { header: 'Type', cell: (r) => <Badge tone="info">{r.type}</Badge> },
    { header: 'Discount', align: 'right', cell: (r) => `${r.percent}%` },
  ];

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="Concessions & Scholarships" subtitle="Discounts that reduce net dues. Posted as CONCESSION ledger entries so the audit trail stays intact." />
      <Badge tone="warning">Preview — backing tables land in a later milestone</Badge>

      <div className="grid-stats mt-16">
        <StatCard label="Concession types" value={drafts.length} accent />
        <StatCard label="Merit-based" value={drafts.filter((d) => d.type === 'MERIT').length} />
        <StatCard label="Avg discount" value={`${drafts.length ? Math.round(drafts.reduce((s, d) => s + d.percent, 0) / drafts.length) : 0}%`} />
      </div>

      <Can permission="fee.manage">
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>New concession (draft)</h3>
          <div className="flex gap-8" style={{ alignItems: 'flex-end' }}>
            <Field label="Name">
              <input className="input" placeholder="e.g. Sibling discount" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Percent">
              <input className="input" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} style={{ maxWidth: 90 }} />
            </Field>
            <Button disabled={!name.trim()} onClick={add}>Add draft</Button>
          </div>
        </Card>
      </Can>

      <Card className="mt-16">
        {drafts.length === 0 ? (
          <EmptyState icon={<Icon name="wallet" />} title="No concessions configured" desc="Define scholarship and discount rules to apply against student dues." />
        ) : (
          <DataTable<DraftConcession> rows={drafts} rowKey={(r) => r.id} columns={columns} />
        )}
      </Card>
    </div>
  );
}
