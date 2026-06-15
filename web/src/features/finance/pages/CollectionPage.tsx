// Fee Collection Counter (M5) — the marquee STAFF screen. Pick a student, see their
// derived outstanding, take the money. Recording a payment writes a CREDIT + a gapless
// receipt in one tx (server-side); the outstanding recomputes from the ledger sum.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Field, Icon, PageHeader, Select, Spinner, StatCard } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useStudents } from '@/features/students/api/studentsApi';
import { useLedger, useRecordPayment } from '../api/financeApi';

const METHODS = ['CASH', 'UPI', 'CARD', 'CHEQUE', 'ONLINE'];

function inr(n: number) {
  return `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CollectionPage() {
  const { data: studentsData, isLoading: loadingStudents } = useStudents();
  const [studentId, setStudentId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [receipt, setReceipt] = useState<string | null>(null);

  const { data: ledger, isLoading: loadingLedger } = useLedger(studentId);
  const pay = useRecordPayment(studentId);

  const students = studentsData?.students ?? [];
  const student = useMemo(() => students.find((s) => s.id === studentId), [students, studentId]);
  const outstanding = ledger?.outstanding ?? 0;

  const amt = Number(amount);
  const canRecord = !!studentId && amt > 0 && !pay.isPending;

  function settle() {
    setAmount(String(outstanding > 0 ? outstanding : ''));
  }

  function submit() {
    setReceipt(null);
    pay.mutate(
      { amount: amt, method },
      { onSuccess: (res) => { setReceipt(res.receipt_no); setAmount(''); } },
    );
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="Fee Collection Counter" subtitle="Take a payment in seconds. Outstanding is the live derived balance; every receipt number is gapless." />

      <Card className="mt-16">
        <Field label="Student" hint="Search by name in the dropdown.">
          <Select value={studentId} onChange={(e) => { setStudentId(e.target.value); setReceipt(null); setAmount(''); }}>
            <option value="">{loadingStudents ? 'Loading students…' : 'Select a student…'}</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · #{s.admission_no}</option>
            ))}
          </Select>
        </Field>
      </Card>

      {!studentId && (
        <Card className="mt-16">
          <EmptyState icon={<Icon name="users" />} title="Pick a student to begin" desc="Their outstanding balance and payment form appear here." />
        </Card>
      )}

      {studentId && (
        <>
          <div className="grid-stats mt-16">
            <StatCard
              label="Outstanding (derived)"
              value={loadingLedger ? <Spinner /> : inr(outstanding)}
              accent
            />
            <StatCard label="Σ charges" value={inr(ledger?.total_debit ?? 0)} />
            <StatCard label="Σ collected" value={inr(ledger?.total_credit ?? 0)} />
          </div>

          {receipt && (
            <Card className="mt-16" flat>
              <div className="flex gap-8" style={{ alignItems: 'center' }}>
                <Badge tone="success">Receipt {receipt}</Badge>
                <span className="muted">Payment recorded.</span>
                {student && <Link to={`/ledger/${student.id}`} className="subtle" style={{ fontSize: 13 }}>View ledger →</Link>}
              </div>
            </Card>
          )}

          <Can permission="payment.record">
            <Card className="mt-16">
              <div className="between" style={{ marginBottom: 12 }}>
                <h3 style={{ fontSize: 15 }}>Record a payment</h3>
                {outstanding > 0 && <Button variant="ghost" onClick={settle}>Settle full ({inr(outstanding)})</Button>}
              </div>
              {pay.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(pay.error)}</p>}
              <div className="flex gap-8" style={{ alignItems: 'flex-end' }}>
                <Field label="Amount">
                  <input className="input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ maxWidth: 160 }} />
                </Field>
                <Field label="Method">
                  <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                    {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </Field>
                <Button disabled={!canRecord} onClick={submit}>
                  {pay.isPending ? 'Recording…' : 'Take payment'}
                </Button>
              </div>
            </Card>
          </Can>
        </>
      )}
    </div>
  );
}
