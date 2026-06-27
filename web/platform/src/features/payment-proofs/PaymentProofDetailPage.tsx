// A single payment proof + the registration it belongs to, with approve / reject. We
// resolve the proof from the pending-proofs queue (which carries registration_id), then
// load the registration detail so approve runs the full provisioning chain.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, EmptyState, Field, Icon, PageHeader, SectionCard, Spinner } from '@/shared/ui';
import { useRequestClarification } from '../../shared/platformApi';
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
  const requestInfo = useRequestClarification();
  const [provisioned, setProvisioned] = useState<ApproveResult | null>(null);
  const [note, setNote] = useState('');

  const reg = detail?.registration;
  const reviewable = reg?.status === 'PENDING_PAYMENT_REVIEW';
  const infoRequested = proof?.status === 'INFO_REQUESTED';
  // clarification_note is not yet in the generated Proof type.
  const clarificationNote = (proof as any)?.clarification_note as string | undefined;

  return (
    <div style={{ maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <Link to="/payment-proofs" className="flex gap-8" style={{ alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
          <Icon name="arrow-left" size={15} /> Payment Proofs
        </Link>
        <PageHeader title="Payment Proof Review" subtitle="Verify the submitted payment, then approve to provision the school or reject with a reason." />
      </div>

      {proofs.isLoading && <Spinner />}
      {proofs.error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(proofs.error)}</p>}
      {!proofs.isLoading && !proof && <EmptyState icon={<Icon name="wallet" />} title="Not in the queue" desc="This proof is no longer pending — it may already have been reviewed." />}

      {provisioned && (
        <SectionCard icon="shield" title={`Provisioned · ${provisioned.slug}`} tone="success">
          <div className="row"><span className="muted">Admin login</span><code>{provisioned.admin_login}</code></div>
          <div className="row"><span className="muted">Temp password</span><code>{provisioned.admin_temp_password}</code></div>
          <div className="row"><span className="muted">Invoice</span><span>{provisioned.invoice_number}</span></div>
          <p className="subtle" style={{ fontSize: 12, marginTop: 8 }}>Hand these credentials to the school admin — shown once.</p>
          <div className="mt-16"><Button variant="ghost" onClick={() => navigate('/payment-proofs')}>Done</Button></div>
        </SectionCard>
      )}

      {(approve.error || reject.error || requestInfo.error) && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(approve.error || reject.error || requestInfo.error)}</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 24, alignItems: 'start' }}>
        {proof && (
          <SectionCard icon="wallet" title="Payment proof" subtitle={`/${proof.slug}`} tone="warning">
            <div className="flex gap-8" style={{ alignItems: 'center' }}>
              <Link to={`/registrations/${proof.registration_id}`} style={{ fontWeight: 600, fontSize: 15 }}>{proof.school_name}</Link>
              <Badge tone={infoRequested ? 'info' : 'warning'}>{proof.status}</Badge>
            </div>
            {infoRequested && (
              <div className="row mt-16">
                <span className="muted">Clarification</span>
                <span>{clarificationNote || 'More information was requested from the school.'}</span>
              </div>
            )}
            <div className="row mt-16"><span className="muted">Amount</span><span>{proof.currency} {proof.amount.toLocaleString()}</span></div>
            <div className="row"><span className="muted">Method</span><span>{proof.method}</span></div>
            <div className="row"><span className="muted">Txn ID</span><code>{proof.txn_id}</code></div>
            {proof.payer_name && <div className="row"><span className="muted">Payer</span><span>{proof.payer_name}</span></div>}
            {proof.paid_at && <div className="row"><span className="muted">Paid at</span><span>{new Date(proof.paid_at).toLocaleString()}</span></div>}
            <div className="row"><span className="muted">Submitted</span><span>{new Date(proof.created_at).toLocaleString()}</span></div>
          </SectionCard>
        )}

        {reviewable && (
          <SectionCard icon="help" title="Request clarification" tone="info">
            <p className="subtle" style={{ fontSize: 12, marginBottom: 12 }}>
              Ask the school for more information instead of approving or rejecting. The proof is held as INFO_REQUESTED.
            </p>
            <Field label="Note to the school" hint="What do you need clarified about this payment?">
              <textarea
                className="input"
                rows={3}
                value={note}
                placeholder="e.g. The transaction ID doesn't match our records — please re-share the bank receipt."
                onChange={(e) => setNote(e.target.value)}
                style={{ resize: 'vertical', minHeight: 72 }}
              />
            </Field>
            <div className="mt-16">
              <Button
                variant="secondary"
                disabled={requestInfo.isPending || !note.trim()}
                onClick={() =>
                  requestInfo.mutate(
                    { id, note: note.trim() },
                    { onSuccess: () => navigate('/payment-proofs') },
                  )
                }
              >
                {requestInfo.isPending ? 'Requesting…' : 'Request Clarification'}
              </Button>
            </div>
          </SectionCard>
        )}
      </div>

      {reviewable && (
        <div className="flex gap-8">
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
