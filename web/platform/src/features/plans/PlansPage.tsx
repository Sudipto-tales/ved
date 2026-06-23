// Plans & Prices — the plan catalog with full CRUD for the platform super-admin.
// List from GET /api/v1/platform/plans; create / update / duplicate / archive via the
// platformApi mutation hooks. The form is an inline panel (Card) shown conditionally.
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Icon,
  SectionCard,
  Select,
} from '@/shared/ui';
import {
  useCreatePlan,
  usePlanAction,
  usePlatformPlans,
  useUpdatePlan,
  type Plan,
  type PlanInput,
} from '../../shared/platformApi';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const STATUS_TONE: Record<string, 'success' | 'neutral'> = { ACTIVE: 'success', ARCHIVED: 'neutral' };

const FORM_GRID = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as const;

const EMPTY_INPUT: PlanInput = {
  name: '',
  tier: 'T1',
  currency: 'INR',
  price: 0,
  annual_price: 0,
  billing_cycle: 'MONTHLY',
  seats: 0,
  enabled_modules: [],
};

function planToInput(p: Plan): PlanInput {
  return {
    name: p.name,
    tier: p.tier,
    currency: p.currency,
    price: p.price,
    annual_price: p.annual_price,
    billing_cycle: p.billing_cycle,
    seats: p.seats,
    enabled_modules: p.enabled_modules ?? [],
  };
}

function PlanForm({ plan, onClose }: { plan?: Plan; onClose: () => void }) {
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const [draft, setDraft] = useState<PlanInput>(plan ? planToInput(plan) : EMPTY_INPUT);
  const [modules, setModules] = useState<string>((plan?.enabled_modules ?? []).join(', '));
  const pending = create.isPending || update.isPending;
  const error = create.error || update.error;

  function patch<K extends keyof PlanInput>(key: K, value: PlanInput[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submit() {
    const body: PlanInput = {
      ...draft,
      enabled_modules: modules
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    };
    const opts = { onSuccess: () => onClose() };
    if (plan) update.mutate({ id: plan.id, body }, opts);
    else create.mutate(body, opts);
  }

  return (
    <Card className="mt-16" style={{ borderColor: 'var(--accent)' }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>{plan ? `Edit ${plan.name}` : 'New plan'}</h3>
      <div className="mt-16" style={FORM_GRID}>
        <Field label="Name">
          <input className="input" value={draft.name} placeholder="Standard" onChange={(e) => patch('name', e.target.value)} />
        </Field>
        <Field label="Tier">
          <Select value={draft.tier} onChange={(e) => patch('tier', e.target.value)}>
            <option value="T1">T1</option>
            <option value="T2">T2</option>
            <option value="T3">T3</option>
          </Select>
        </Field>
        <Field label="Currency">
          <input className="input" value={draft.currency} onChange={(e) => patch('currency', e.target.value)} />
        </Field>
        <Field label="Billing cycle">
          <Select value={draft.billing_cycle} onChange={(e) => patch('billing_cycle', e.target.value)}>
            <option value="MONTHLY">MONTHLY</option>
            <option value="QUARTERLY">QUARTERLY</option>
            <option value="ANNUAL">ANNUAL</option>
          </Select>
        </Field>
        <Field label="Monthly price">
          <input className="input" type="number" value={draft.price} onChange={(e) => patch('price', Number(e.target.value))} />
        </Field>
        <Field label="Annual price">
          <input className="input" type="number" value={draft.annual_price} onChange={(e) => patch('annual_price', Number(e.target.value))} />
        </Field>
        <Field label="Seats">
          <input className="input" type="number" value={draft.seats} onChange={(e) => patch('seats', Number(e.target.value))} />
        </Field>
        <Field label="Enabled modules" hint="Comma-separated, e.g. students, finance, lms">
          <input className="input" value={modules} placeholder="students, finance" onChange={(e) => setModules(e.target.value)} />
        </Field>
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{String(error)}</p>}
      <div className="flex gap-8 mt-16">
        <Button disabled={pending || !draft.name.trim()} onClick={submit}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

// PlansPanel — the plan catalog table + CRUD form, header-less so it can be embedded
// (the Subscriptions page renders it; there is no longer a standalone Plans page).
export function PlansPanel() {
  const { data, isLoading, error } = usePlatformPlans();
  const action = usePlanAction();
  const [form, setForm] = useState<{ plan?: Plan } | null>(null);
  const rows = data?.plans ?? [];

  function duplicate(p: Plan) {
    action.mutate({ id: p.id, action: 'duplicate' });
  }

  function archive(p: Plan) {
    if (window.confirm(`Archive plan "${p.name}"? It will no longer be offered at sign-up.`)) {
      action.mutate({ id: p.id, action: 'archive' });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
      {action.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(action.error)}</p>}

      {form && <PlanForm plan={form.plan} onClose={() => setForm(null)} />}

      <SectionCard
        icon="layers"
        title="Plan Catalog"
        tone="violet"
        right={
          <Button onClick={() => setForm({})}>
            <span className="flex gap-8" style={{ alignItems: 'center' }}>
              <Icon name="layers" size={15} /> New plan
            </span>
          </Button>
        }
      >
        <DataTable<Plan>
          loading={isLoading}
          rows={rows}
          rowKey={(p) => p.id}
          searchable
          searchText={(p) => `${p.name} ${p.tier} ${p.billing_cycle} ${p.status}`}
          empty={<EmptyState icon={<Icon name="layers" />} title="No plans" desc="The plan catalog is empty. Create your first plan." />}
          columns={[
            { header: 'Plan', cell: (p) => <span style={{ fontWeight: 600 }}>{p.name}</span> },
            { header: 'Monthly Price', align: 'right', cell: (p) => inr.format(p.price) },
            { header: 'Annual Price', align: 'right', cell: (p) => inr.format(p.annual_price) },
            { header: 'Seats', align: 'right', cell: (p) => p.seats },
            { header: 'Active Subscribers', align: 'right', cell: (p) => p.active_subscribers },
            { header: 'Status', cell: (p) => <Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>{p.status}</Badge> },
            {
              header: '',
              align: 'right',
              cell: (p) => (
                <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Edit"
                    aria-label="Edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm({ plan: p });
                    }}
                  >
                    <Icon name="edit" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Duplicate"
                    aria-label="Duplicate"
                    disabled={action.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicate(p);
                    }}
                  >
                    <Icon name="copy" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Archive"
                    aria-label="Archive"
                    disabled={action.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      archive(p);
                    }}
                  >
                    <Icon name="archive" />
                  </button>
                </span>
              ),
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}
