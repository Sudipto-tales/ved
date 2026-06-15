// Pay fees online (M7, Tier-2) — DESIGNED SCAFFOLD over a REAL read. The outstanding amount
// is the live derived balance from the finance ledger (GET fees, the same Σ DEBIT − Σ CREDIT
// the school sees). There is no payment-gateway backend yet, so the method picker and Pay
// button are a finished-looking preview: Pay is disabled and an EmptyState explains gateway
// payment is coming. When the gateway lands, Pay POSTs through the guardian.pay_fees write.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  Select,
  Spinner,
  StatCard,
} from '@/shared/ui';
import { useChildFees } from '../api/guardianApi';

const METHODS = [
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Credit / Debit card' },
  { id: 'netbanking', label: 'Net banking' },
];

export default function PayFeesPage() {
  const { childId = '' } = useParams();
  const { data, isLoading, error } = useChildFees(childId);
  const [method, setMethod] = useState(METHODS[0].id);
  const outstanding = data?.outstanding ?? 0;
  const nothingDue = !isLoading && outstanding <= 0;

  return (
    <div style={{ maxWidth: 640 }}>
      <PageHeader
        title="Pay fees online"
        subtitle="Settle your child's outstanding dues securely — straight from the school's ledger."
      />
      <Link to={`/guardian/children/${childId}/fees`} className="subtle" style={{ fontSize: 13 }}>
        ← Back to fees
      </Link>

      {isLoading && <div className="mt-16"><Spinner /></div>}
      {error && <p style={{ color: 'var(--danger)' }}>{String(error)}</p>}

      {data && (
        <>
          <div className="grid-stats mt-16">
            <StatCard label="Amount due" value={outstanding.toFixed(2)} accent />
            <StatCard label="Charged" value={data.total_debit.toFixed(2)} />
            <StatCard label="Paid" value={data.total_credit.toFixed(2)} />
          </div>

          {nothingDue ? (
            <Card className="mt-16">
              <EmptyState
                icon={<Icon name="wallet" />}
                title="All settled"
                desc="There's nothing outstanding for this child right now."
              />
            </Card>
          ) : (
            <Card className="mt-16">
              <Field label="Payment method">
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {METHODS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </Select>
              </Field>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="muted" style={{ flex: 1 }}>Paying now</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {outstanding.toFixed(2)}
                </span>
              </div>
              <div className="mt-16">
                <Button disabled title="Online payment is not available yet">
                  Pay {outstanding.toFixed(2)}
                </Button>
              </div>
              <div className="mt-16">
                <EmptyState
                  icon={<Icon name="wallet" />}
                  title="Online payment coming soon"
                  desc="Paying fees online through a payment gateway is on the way. For now, please pay at the school office — payments you make there appear here automatically."
                />
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
