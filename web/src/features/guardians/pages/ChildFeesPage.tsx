// Child fees (M7) — a guardian-scoped read of the finance ledger. Outstanding is the
// same derived Σ DEBIT − Σ CREDIT the school sees; never a cached balance.
import { Link, useParams } from 'react-router-dom';
import { Badge, Card, PageHeader, Spinner, StatCard } from '@/shared/ui';
import { useChildFees } from '../api/guardianApi';

export default function ChildFeesPage() {
  const { childId = '' } = useParams();
  const { data, isLoading, error } = useChildFees(childId);

  return (
    <div>
      <PageHeader title="Fees" subtitle="Dues and payments for your child, straight from the append-only ledger." />
      <Link to="/guardian" className="subtle" style={{ fontSize: 13 }}>← Back to my children</Link>
      {isLoading && <div className="mt-16"><Spinner /></div>}
      {error && <p style={{ color: 'var(--danger)' }}>{String(error)}</p>}
      {data && (
        <>
          <div className="grid-stats mt-16">
            <StatCard label="Outstanding" value={data.outstanding.toFixed(2)} accent />
            <StatCard label="Charged" value={data.total_debit.toFixed(2)} />
            <StatCard label="Paid" value={data.total_credit.toFixed(2)} />
          </div>
          <Card className="mt-16">
            {data.entries.length === 0 && <p className="muted">No fee activity yet.</p>}
            {data.entries.map((e) => (
              <div className="row" key={e.id}>
                <Badge tone={e.direction === 'DEBIT' ? 'neutral' : 'success'}>{e.direction}</Badge>
                <span style={{ flex: 1, marginLeft: 8 }}>{e.source_type}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{e.amount.toFixed(2)}</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
