// Payment-proof step. The school records its bank/UPI transfer details; POST moves the
// registration into PENDING_PAYMENT_REVIEW, then we send them to the status tracker.
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, EmptyState, Field, Icon, PageHeader, Select, Spinner } from '@/shared/ui';
import { ApiError } from '../../shared/api';
import { useRegistrationStatus, useSubmitProof } from './api';

export default function SignupProofPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const reg = useRegistrationStatus(id);
  const submit = useSubmitProof(id);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [txnId, setTxnId] = useState('');
  const [payerName, setPayerName] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amount);
  const canSubmit = amountNum > 0 && method && txnId.trim() && payerName.trim() && !submit.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await submit.mutateAsync({
        amount: amountNum,
        method,
        txn_id: txnId.trim(),
        payer_name: payerName.trim(),
        paid_at: paidAt ? new Date(paidAt).toISOString() : undefined,
      });
      navigate(`/signup/status/${id}`);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 422)) setError('This payment proof was rejected — check the amount and transaction id (it may already be submitted).');
      else setError('Could not submit payment proof. Please try again.');
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <PageHeader title="Submit payment proof" subtitle="Record your transfer so our team can verify it and activate your school." />

      {reg.isLoading && <Card className="mt-16"><Spinner /></Card>}
      {!reg.isLoading && !reg.data && (
        <Card className="mt-16"><EmptyState icon={<Icon name="wallet" />} title="Registration not found" desc="Start again from the registration form." action={<Button onClick={() => navigate('/signup/register')}>Register</Button>} /></Card>
      )}

      {reg.data && (
        <Card className="mt-16">
          <div className="row"><span className="muted">School</span><span style={{ fontWeight: 600 }}>{reg.data.school_name}</span></div>
          <form onSubmit={onSubmit} className="mt-16">
            <Field label="Amount paid">
              <input className="input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="49999" />
            </Field>
            <Field label="Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="UPI">UPI</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CARD">Card</option>
              </Select>
            </Field>
            <Field label="Transaction / reference ID">
              <input className="input" value={txnId} onChange={(e) => setTxnId(e.target.value)} placeholder="UTR / UPI ref / cheque no." />
            </Field>
            <Field label="Payer name">
              <input className="input" value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Account holder name" />
            </Field>
            <Field label="Paid at (optional)">
              <input className="input" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </Field>

            {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }} role="alert">{error}</p>}

            <div className="mt-16">
              <Button type="submit" disabled={!canSubmit} style={{ width: '100%' }}>
                {submit.isPending ? 'Submitting…' : 'Submit for review'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
