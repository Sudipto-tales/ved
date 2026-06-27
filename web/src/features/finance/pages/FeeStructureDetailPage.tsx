// Fee Structure detail (M5 scaffold) — would list the structure's component fee heads
// and amounts, then offer "Generate invoices" for the target cohort. Backing tables
// aren't built; this is the designed shell reading the :id from the route.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, StatCard, type Column } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';

interface DraftLine {
  id: string;
  head: string;
  amount: number;
}

function inr(n: number) {
  return `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function FeeStructureDetailPage() {
  const { id = '' } = useParams();
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [head, setHead] = useState('');
  const [amount, setAmount] = useState('');

  function add() {
    if (!head.trim() || !Number(amount)) return;
    setLines((l) => [...l, { id: crypto.randomUUID(), head: head.trim(), amount: Number(amount) }]);
    setHead('');
    setAmount('');
  }

  const total = lines.reduce((s, l) => s + l.amount, 0);

  const columns: Column<DraftLine>[] = [
    { header: 'Fee head', cell: (r) => <span style={{ fontWeight: 600 }}>{r.head}</span> },
    { header: 'Amount', align: 'right', cell: (r) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(r.amount)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Fee Structure" subtitle="Component fee heads and their amounts. Generating invoices applies this bundle to every student in the cohort." />
      <Link to="/fee-structures" className="subtle" style={{ fontSize: 13 }}>← Back to structures</Link>
      <div className="mt-8"><Badge tone="warning">Preview · structure {id.slice(0, 8)}</Badge></div>

      <div className="grid-stats mt-16">
        <StatCard label="Per-student total" value={inr(total)} accent />
        <StatCard label="Components" value={lines.length} />
      </div>

      <Can permission="fee.manage">
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Add component (draft)</h3>
          <div className="flex gap-8" style={{ alignItems: 'flex-end' }}>
            <Field label="Fee head">
              <input className="input" placeholder="e.g. Tuition" value={head} onChange={(e) => setHead(e.target.value)} />
            </Field>
            <Field label="Amount">
              <input className="input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ maxWidth: 140 }} />
            </Field>
            <Button disabled={!head.trim() || !Number(amount)} onClick={add}>Add</Button>
          </div>
        </Card>
      </Can>

      <Card className="mt-16">
        {lines.length === 0 ? (
          <EmptyState icon={<Icon name="layers" />} title="No components yet" desc="Add fee heads with amounts to compose this structure." />
        ) : (
          <DataTable<DraftLine> rows={lines} rowKey={(r) => r.id} columns={columns} />
        )}
      </Card>

      <Can permission="fee.manage">
        <div className="mt-16">
          <Button disabled={lines.length === 0} title="Bulk invoice generation arrives with the backing tables">Generate invoices</Button>
        </div>
      </Can>
    </div>
  );
}
