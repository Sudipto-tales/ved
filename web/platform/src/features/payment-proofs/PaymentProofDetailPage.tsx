// A single payment proof + the registration it belongs to, with approve / reject. We
// resolve the proof from the pending-proofs queue (which carries registration_id), then
// load the registration detail so approve runs the full provisioning chain.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Icon, PageHeader, Spinner } from '@/shared/ui';
import { useApprove, useRegistration, useReject, usePaymentProofs, type ApproveResult } from '../registrations/api';

export default function PaymentProofDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const proofs = usePaymentProofs();
  const proof = proofs.data?.payment_proofs.find((p) => p.id === id);
  const regId = proof?.registration_id ?? '';
  const { data: detail } = useRegistration(regId);
  const approve = useApprove();
  const reject = useReject();
  const [provisioned, setProvisioned] = useState<ApproveResult | null>(null);

  const reg = detail?.registration;
  const reviewable = reg?.status === 'PENDING_PAYMENT_REVIEW';

  return (
    <div style={{ maxWidth: 720 }}>
      <Link to="/payment-proofs" className="flex gap-8" style={{ alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
        <Icon name="arrow-left" size={15} /> Payment Proofs
      </Link>
      <PageHeader title="Payment Proof Review" subtitle="Verify the submitted payment, then approve to provision the school or reject with a reason." />

      {proofs.isLoading && <Spinner />}
      {proofs.error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(proofs.error)}</p>}
      {!proofs.isLoading && !proof && <EmptyState icon={<Icon name="wallet" />} title="Not in the queue" desc="This proof is no longer pending — it may already have been reviewed." />}

      {provisioned && (
        <Card className="mt-16" style={{ borderColor: 'var(--accent)' }}>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Provisioned · {provisioned.slug}</h3>
          <div className="row"><span className="muted">Admin login</span><code>{provisioned.admin_login}</code></div>
          <div className="row"><span className="muted">Temp password</span><code>{provisioned.admin_temp_password}</code></div>
          <div className="row"><span className="muted">Invoice</span><span>{provisioned.invoice_number}</span></div>
          <p className="subtle" style={{ fontSize: 12, marginTop: 8 }}>Hand these credentials to the school admin — shown once.</p>
          <div className="mt-16"><Button variant="ghost" onClick={() => navigate('/payment-proofs')}>Done</Button></div>
        </Card>
      )}

      {(approve.error || reject.error) && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(approve.error || reject.error)}</p>
      )}

      {proof && (
        <Card className="mt-16">
          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <Link to={`/registrations/${proof.registration_id}`} style={{ fontWeight: 600, fontSize: 15 }}>{proof.school_name}</Link>
            <span className="subtle" style={{ fontSize: 12 }}>/{proof.slug}</span>
            <Badge tone="warning">{proof.status}</Badge>
          </div>
          <div className="row mt-16"><span className="muted">Amount</span><span>{proof.currency} {proof.amount.toLocaleString()}</span></div>
          <div className="row"><span className="muted">Method</span><span>{proof.method}</span></div>
          <div className="row"><span className="muted">Txn ID</span><code>{proof.txn_id}</code></div>
          {proof.payer_name && <div className="row"><span className="muted">Payer</span><span>{proof.payer_name}</span></div>}
          {proof.paid_at && <div className="row"><span className="muted">Paid at</span><span>{new Date(proof.paid_at).toLocaleString()}</span></div>}
          <div className="row"><span className="muted">Submitted</span><span>{new Date(proof.created_at).toLocaleString()}</span></div>
        </Card>
      )}

      {reviewable && (
        <div className="flex gap-8 mt-16">
          <Button
            disabled={approve.isPending}
            onClick={() => approve.mutate(regId, { onSuccess: (res) => setProvisioned(res) })}
          >
            {approve.isPending ? 'Approving…' : 'Approve & provision'}
          </Button>
          <Button
            variant="ghost"
            disabled={reject.isPending}
            onClick={() => {
              const reason = prompt('Reject reason?') || 'rejected';
              reject.mutate({ id: regId, reason }, { onSuccess: () => navigate('/payment-proofs') });
            }}
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
