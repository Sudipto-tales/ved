// Pay fees online (M7, Tier-2) — REAL guarded write. The outstanding amount is the live
// derived balance from the finance ledger (GET fees, the same Σ DEBIT − Σ CREDIT the school
// sees). Pay POSTs through guardian.pay_fees: a SIMULATED gateway that records a real payment
// (gapless receipt + CREDIT) in the same finance ledger, gated server-side by can_pay. When a
// real gateway lands it slots in behind the same endpoint.
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
import { useChildFees, usePayChildFees } from '../api/guardianApi';

const METHODS = [
  { id: 'UPI', label: 'UPI' },
  { id: 'CARD', label: 'Credit / Debit card' },
  { id: 'NETBANKING', label: 'Net banking' },
];

export default function PayFeesPage() {
  const { childId = '' } = useParams();
  const { data, isLoading, error } = useChildFees(childId);
  const pay = usePayChildFees(childId);
  const [method, setMethod] = useState(METHODS[0].id);
  const outstanding = data?.outstanding ?? 0;
  const nothingDue = !isLoading && outstanding <= 0;

  return (
    <div>
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
                <Button
                  disabled={pay.isPending || outstanding <= 0}
                  onClick={() => pay.mutate({ amount: outstanding, method })}
                >
                  {pay.isPending ? 'Processing…' : `Pay ${outstanding.toFixed(2)}`}
                </Button>
              </div>
              {pay.isError && (
                <p className="mt-16" style={{ color: 'var(--danger)' }}>
                  {String((pay.error as Error)?.message ?? pay.error)}
                </p>
              )}
              {pay.isSuccess && (
                <div className="mt-16">
                  <EmptyState
                    icon={<Icon name="wallet" />}
                    title="Payment recorded"
                    desc={`Receipt ${pay.data.receipt_no}. Your child's balance has been updated.`}
                  />
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
