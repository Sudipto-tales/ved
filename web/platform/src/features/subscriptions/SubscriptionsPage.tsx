// Subscription Plans & Pricing. The plan catalog is read live (GET /api/v1/plans); plan
// CRUD has no backend yet, so "New plan" / "Edit" open a DESIGNED SCAFFOLD form that is
// disabled — wiring lands when a plan-management endpoint exists.
import { useState } from 'react';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, Select } from '@/shared/ui';
import { usePlans, type Plan } from './api';

const TIER_TONE: Record<string, 'neutral' | 'primary' | 'warning'> = { T1: 'primary', T2: 'neutral', T3: 'warning' };

function PlanForm({ plan, onClose }: { plan?: Plan; onClose: () => void }) {
  return (
    <Card className="mt-16" style={{ borderColor: 'var(--accent)' }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>{plan ? `Edit ${plan.name}` : 'New plan'}</h3>
      <p className="subtle" style={{ fontSize: 12 }}>Scaffold — plan management has no backend endpoint yet, so this form is read-only.</p>
      <div className="mt-16" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Name"><input className="input" defaultValue={plan?.name} disabled placeholder="Standard" /></Field>
        <Field label="Tier">
          <Select defaultValue={plan?.tier ?? 'T1'} disabled>
            <option value="T1">T1</option><option value="T2">T2</option><option value="T3">T3</option>
          </Select>
        </Field>
        <Field label="Price"><input className="input" type="number" defaultValue={plan?.price} disabled placeholder="0" /></Field>
        <Field label="Currency"><input className="input" defaultValue={plan?.currency ?? 'INR'} disabled /></Field>
        <Field label="Billing cycle">
          <Select defaultValue={plan?.billing_cycle ?? 'ANNUAL'} disabled>
            <option value="MONTHLY">MONTHLY</option><option value="QUARTERLY">QUARTERLY</option><option value="ANNUAL">ANNUAL</option>
          </Select>
        </Field>
        <Field label="Seats"><input className="input" type="number" defaultValue={plan?.seats} disabled placeholder="100" /></Field>
      </div>
      <div className="flex gap-8 mt-16">
        <Button disabled title="No plan-management backend yet">Save</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Card>
  );
}

export default function SubscriptionsPage() {
  const { data, isLoading, error } = usePlans();
  const [form, setForm] = useState<{ plan?: Plan } | null>(null);
  const rows = data?.plans ?? [];

  return (
    <div style={{ maxWidth: 920 }}>
      <PageHeader title="Subscription Plans & Pricing" subtitle="The plan catalog offered to schools at sign-up. Pricing, seats and module entitlements per tier." />
      {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}

      <div className="toolbar mt-16">
        <span className="grow" style={{ flex: 1 }} />
        <Button onClick={() => setForm({})}><span className="flex gap-8" style={{ alignItems: 'center' }}><Icon name="layers" size={15} /> New plan</span></Button>
      </div>

      {form && <PlanForm plan={form.plan} onClose={() => setForm(null)} />}

      <Card className="mt-16">
        <DataTable<Plan>
          loading={isLoading}
          rows={rows}
          rowKey={(p) => p.id}
          empty={<EmptyState icon={<Icon name="layers" />} title="No plans" desc="The plan catalog is empty." />}
          columns={[
            { header: 'Plan', cell: (p) => <span style={{ fontWeight: 600 }}>{p.name}</span> },
            { header: 'Tier', cell: (p) => <Badge tone={TIER_TONE[p.tier] ?? 'neutral'}>{p.tier}</Badge> },
            { header: 'Price', align: 'right', cell: (p) => `${p.currency} ${p.price.toLocaleString()}` },
            { header: 'Cycle', cell: (p) => p.billing_cycle },
            { header: 'Seats', align: 'right', cell: (p) => p.seats },
            { header: 'Modules', cell: (p) => <span className="subtle" style={{ fontSize: 12 }}>{(p.enabled_modules ?? []).length} modules</span> },
            { header: '', align: 'right', cell: (p) => <Button variant="ghost" onClick={() => setForm({ plan: p })}>Edit</Button> },
          ]}
        />
      </Card>
    </div>
  );
}
