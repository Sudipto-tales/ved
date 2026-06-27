// Fee Heads (M5) — the chart of fee accounts (tuition, transport, …). List via
// GET /finance/fee-heads + a create form. Each head is RECURRING or ONE_TIME.
import { useState } from 'react';
import { Badge, Button, Card, DataTable, Field, PageHeader, Select, StatCard } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useFeeHeads, useCreateFeeHead, type FeeHead } from '../api/financeApi';

const KINDS = ['RECURRING', 'ONE_TIME'];

export default function FeeHeadsPage() {
  const { data, isLoading, error } = useFeeHeads();
  const create = useCreateFeeHead();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('RECURRING');

  const heads = data?.fee_heads ?? [];
  const recurring = heads.filter((h) => h.kind === 'RECURRING').length;

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="Fee Heads" subtitle="The chart of fee accounts every invoice line maps to. Define them once, reuse everywhere." />

      <div className="grid-stats mt-16">
        <StatCard label="Fee heads" value={heads.length} accent />
        <StatCard label="Recurring" value={recurring} />
        <StatCard label="One-time" value={heads.length - recurring} />
      </div>

      <Can permission="fee.manage">
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Add a fee head</h3>
          {create.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(create.error)}</p>}
          <div className="flex gap-8" style={{ alignItems: 'flex-end' }}>
            <Field label="Name">
              <input className="input" placeholder="e.g. Tuition Fee" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Kind">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </Field>
            <Button
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate({ name: name.trim(), kind }, { onSuccess: () => setName('') })}
            >
              {create.isPending ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </Card>
      </Can>

      <Card className="mt-16">
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<FeeHead>
          loading={isLoading}
          rows={heads}
          rowKey={(r) => r.id}
          empty="No fee heads yet. Add your first above."
          searchable
          searchText={(r) => `${r.name} ${r.kind}`}
          columns={[
            { header: 'Name', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { header: 'Kind', cell: (r) => <Badge tone={r.kind === 'RECURRING' ? 'primary' : 'neutral'}>{r.kind}</Badge> },
          ]}
        />
      </Card>
    </div>
  );
}
