// Fee Structures (M5 scaffold) — a named bundle of fee heads + amounts applied to a
// class/section/year (e.g. "Grade 5 — 2026"). The backing tables aren't built yet, so
// this is a designed scaffold: a local draft list + the table shell that the real
// GET /finance/fee-structures will populate.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, StatCard, type Column } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';

interface DraftStructure {
  id: string;
  name: string;
  applies_to: string;
  heads: number;
}

export default function FeeStructuresPage() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<DraftStructure[]>([]);
  const [name, setName] = useState('');
  const [appliesTo, setAppliesTo] = useState('');

  function add() {
    if (!name.trim()) return;
    setDrafts((d) => [...d, { id: crypto.randomUUID(), name: name.trim(), applies_to: appliesTo.trim() || '—', heads: 0 }]);
    setName('');
    setAppliesTo('');
  }

  const columns: Column<DraftStructure>[] = [
    { header: 'Structure', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { header: 'Applies to', cell: (r) => <span className="muted">{r.applies_to}</span> },
    { header: 'Fee heads', align: 'right', cell: (r) => <Badge tone="neutral">{r.heads}</Badge> },
  ];

  return (
    <div style={{ maxWidth: 920 }}>
      <PageHeader title="Fee Structures" subtitle="Named bundles of fee heads applied to a class, section, or year. Define once, generate invoices in bulk." />
      <Badge tone="warning">Preview — backing tables land in a later milestone</Badge>

      <div className="grid-stats mt-16">
        <StatCard label="Structures" value={drafts.length} accent />
        <StatCard label="Active" value={0} />
        <StatCard label="Draft" value={drafts.length} />
      </div>

      <Can permission="fee.manage">
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>New structure (draft)</h3>
          <div className="flex gap-8" style={{ alignItems: 'flex-end' }}>
            <Field label="Name">
              <input className="input" placeholder="e.g. Grade 5 — 2026" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Applies to">
              <input className="input" placeholder="Class / section" value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)} />
            </Field>
            <Button disabled={!name.trim()} onClick={add}>Add draft</Button>
          </div>
        </Card>
      </Can>

      <Card className="mt-16">
        {drafts.length === 0 ? (
          <EmptyState icon={<Icon name="layers" />} title="No fee structures yet" desc="Configure a structure to bundle fee heads and bulk-issue invoices for a whole class." />
        ) : (
          <DataTable<DraftStructure>
            rows={drafts}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/fee-structures/${r.id}`)}
            columns={columns}
          />
        )}
      </Card>
    </div>
  );
}
