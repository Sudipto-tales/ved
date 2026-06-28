// Daily Cash Close (M5) — end-of-day reconciliation for the collection counter. Totals
// today's recorded payments by method (read from GET /finance/payments) so the cashier
// can count the drawer against the system. "Close session" is a local affordance for now;
// a persisted cash-session table lands in a later milestone.
import { useMemo, useState } from 'react';
import { Badge, Button, Card, DataTable, PageHeader, StatCard, type Column } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { usePayments } from '../api/financeApi';

function inr(n: number) {
  return `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

interface MethodTotal {
  method: string;
  count: number;
  total: number;
}

export default function CashClosePage() {
  const { data, isLoading } = usePayments();
  const [closed, setClosed] = useState(false);

  const todays = useMemo(
    () => (data?.payments ?? []).filter((p) => p.status !== 'VOIDED' && isToday(p.paid_at)),
    [data],
  );

  const byMethod: MethodTotal[] = useMemo(() => {
    const m = new Map<string, MethodTotal>();
    todays.forEach((p) => {
      const cur = m.get(p.method) ?? { method: p.method, count: 0, total: 0 };
      cur.count += 1;
      cur.total += p.amount;
      m.set(p.method, cur);
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [todays]);

  const grandTotal = todays.reduce((s, p) => s + p.amount, 0);
  const cashTotal = byMethod.find((b) => b.method === 'CASH')?.total ?? 0;

  const columns: Column<MethodTotal>[] = [
    { header: 'Method', cell: (r) => <Badge tone={r.method === 'CASH' ? 'primary' : 'neutral'}>{r.method}</Badge> },
    { header: 'Receipts', align: 'right', cell: (r) => r.count },
    { header: 'Total', align: 'right', cell: (r) => <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{inr(r.total)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Daily Cash Close" subtitle="End-of-day reconciliation. Count the drawer against today's recorded receipts, then close the session." />

      <div className="grid-stats mt-16">
        <StatCard label="Collected today" value={isLoading ? '…' : inr(grandTotal)} accent />
        <StatCard label="Cash in drawer" value={inr(cashTotal)} />
        <StatCard label="Receipts" value={todays.length} />
      </div>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>By payment method</h3>
        <DataTable<MethodTotal>
          loading={isLoading}
          rows={byMethod}
          rowKey={(r) => r.method}
          empty="No payments recorded today yet."
          columns={columns}
        />
      </Card>

      <Can permission="payment.record">
        <Card className="mt-16">
          <div className="between">
            <div>
              <div style={{ fontWeight: 600 }}>{closed ? 'Session closed' : 'Close today’s session'}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {closed
                  ? 'Drawer reconciled locally. Persisted cash sessions arrive in a later milestone.'
                  : `Confirms ${inr(grandTotal)} across ${todays.length} receipts.`}
              </div>
            </div>
            <Button variant={closed ? 'secondary' : 'primary'} disabled={closed || todays.length === 0} onClick={() => setClosed(true)}>
              {closed ? 'Closed' : 'Close session'}
            </Button>
          </div>
        </Card>
      </Can>
    </div>
  );
}
