// Student ledger detail (M5) — the append-only ledger in action: issue a charge (DEBIT),
// record a payment (CREDIT, gapless receipt), void a payment (REVERSAL — the original
// stays, a negating entry is added). Outstanding is the server-derived sum, never stored.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, PageHeader, Spinner, StatCard } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useLedger, useIssueInvoice, useRecordPayment, useVoidPayment } from '../api/financeApi';

const METHODS = ['CASH', 'UPI', 'CARD', 'CHEQUE', 'ONLINE'];

export default function StudentLedgerPage() {
  const { studentId = '' } = useParams();
  const { data, isLoading, error } = useLedger(studentId);
  const issue = useIssueInvoice(studentId);
  const pay = useRecordPayment(studentId);
  const voidPay = useVoidPayment(studentId);

  const [charge, setCharge] = useState('');
  const [desc, setDesc] = useState('Tuition fee');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');

  const mutErr = issue.error || pay.error || voidPay.error;

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="Student ledger" subtitle="Append-only & event-sourced — corrections are reversal rows, never edits or deletes." />
      <Link to="/ledger" className="subtle" style={{ fontSize: 13 }}>← Back to ledgers</Link>

      {isLoading && <div className="mt-16"><Spinner /></div>}
      {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
      {mutErr && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(mutErr)}</p>}

      {data && (
        <>
          <div className="grid-stats mt-16">
            <StatCard label="Outstanding (derived)" value={data.outstanding.toFixed(2)} accent />
            <StatCard label="Σ charges" value={data.total_debit.toFixed(2)} />
            <StatCard label="Σ paid / credited" value={data.total_credit.toFixed(2)} />
          </div>

          <Can permission="fee.manage">
            <Card className="mt-16">
              <h3 style={{ fontSize: 15, marginBottom: 12 }}>Issue a charge (DEBIT)</h3>
              <div className="flex gap-8">
                <input className="input" placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
                <input className="input" placeholder="Amount" value={charge} onChange={(e) => setCharge(e.target.value)} style={{ maxWidth: 140 }} />
                <Button
                  disabled={!Number(charge) || issue.isPending}
                  onClick={() => issue.mutate({ lines: [{ description: desc, amount: Number(charge) }] }, { onSuccess: () => setCharge('') })}
                >
                  Issue
                </Button>
              </div>
            </Card>
          </Can>

          <Can permission="payment.record">
            <Card className="mt-16">
              <h3 style={{ fontSize: 15, marginBottom: 12 }}>Record a payment (CREDIT)</h3>
              <div className="flex gap-8">
                <input className="input" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ maxWidth: 140 }} />
                <select className="input" value={method} onChange={(e) => setMethod(e.target.value)} style={{ maxWidth: 140 }}>
                  {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <Button
                  disabled={!Number(amount) || pay.isPending}
                  onClick={() => pay.mutate({ amount: Number(amount), method }, { onSuccess: () => setAmount('') })}
                >
                  Record
                </Button>
              </div>
            </Card>
          </Can>

          <Card className="mt-16">
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Ledger entries</h3>
            {data.entries.length === 0 && <p className="muted">No entries yet.</p>}
            {data.entries.map((e) => (
              <div className="row" key={e.id}>
                <Badge tone={e.direction === 'DEBIT' ? 'neutral' : 'success'}>{e.direction}</Badge>
                <span style={{ flex: 1, marginLeft: 8 }}>{e.source_type}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{e.amount.toFixed(2)}</span>
                {e.source_type === 'PAYMENT' && e.source_id && (
                  <Can permission="payment.record">
                    <Button variant="ghost" disabled={voidPay.isPending} onClick={() => { if (confirm('Void this payment?')) voidPay.mutate(e.source_id!); }}>
                      Void
                    </Button>
                  </Can>
                )}
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
