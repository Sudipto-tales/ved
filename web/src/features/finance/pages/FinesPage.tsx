// Fines (M5 scaffold) — late-fee and penalty rules that add FINE ledger entries (DEBITs)
// when a due date lapses. Backing tables aren't built; designed shell with a local draft
// list.
import { useState } from 'react';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, Select, StatCard, type Column } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';

const BASIS = ['FLAT', 'PER_DAY'];

interface DraftFine {
  id: string;
  name: string;
  basis: string;
  amount: number;
}

function inr(n: number) {
  return `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function FinesPage() {
  const [drafts, setDrafts] = useState<DraftFine[]>([]);
  const [name, setName] = useState('');
  const [basis, setBasis] = useState('FLAT');
  const [amount, setAmount] = useState('');

  function add() {
    if (!name.trim() || !Number(amount)) return;
    setDrafts((d) => [...d, { id: crypto.randomUUID(), name: name.trim(), basis, amount: Number(amount) }]);
    setName('');
    setAmount('');
  }

  const columns: Column<DraftFine>[] = [
    { header: 'Fine rule', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { header: 'Basis', cell: (r) => <Badge tone={r.basis === 'PER_DAY' ? 'warning' : 'neutral'}>{r.basis}</Badge> },
    { header: 'Amount', align: 'right', cell: (r) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(r.amount)}{r.basis === 'PER_DAY' ? '/day' : ''}</span> },
  ];

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="Fines" subtitle="Late-fee and penalty rules that post FINE ledger entries when a due date lapses." />
      <Badge tone="warning">Preview — backing tables land in a later milestone</Badge>

      <div className="grid-stats mt-16">
        <StatCard label="Fine rules" value={drafts.length} accent />
        <StatCard label="Per-day" value={drafts.filter((d) => d.basis === 'PER_DAY').length} />
        <StatCard label="Flat" value={drafts.filter((d) => d.basis === 'FLAT').length} />
      </div>

      <Can permission="fee.manage">
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>New fine rule (draft)</h3>
          <div className="flex gap-8" style={{ alignItems: 'flex-end' }}>
            <Field label="Name">
              <input className="input" placeholder="e.g. Late tuition" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Basis">
              <Select value={basis} onChange={(e) => setBasis(e.target.value)}>
                {BASIS.map((b) => <option key={b} value={b}>{b}</option>)}
              </Select>
            </Field>
            <Field label="Amount">
              <input className="input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ maxWidth: 130 }} />
            </Field>
            <Button disabled={!name.trim() || !Number(amount)} onClick={add}>Add draft</Button>
          </div>
        </Card>
      </Can>

      <Card className="mt-16">
        {drafts.length === 0 ? (
          <EmptyState icon={<Icon name="bell" />} title="No fine rules configured" desc="Define penalties to apply automatically when payments run late." />
        ) : (
          <DataTable<DraftFine> rows={drafts} rowKey={(r) => r.id} columns={columns} />
        )}
      </Card>
    </div>
  );
}
