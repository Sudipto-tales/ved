// Single-registration review — the school's details + its submitted payment proof, with
// approve / reject driven from here. Approving runs the full M4 chain (tenant + subscription
// + gapless invoice + signed license + tenant-plane provisioning) and returns the new
// admin's one-time credentials, shown once.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, EmptyState, Icon, PageHeader, SectionCard, Spinner } from '@/shared/ui';
import { useApprove, useRegistration, useReject, type ApproveResult } from './api';

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'warning'> = {
  ACTIVE: 'success',
  PENDING_PAYMENT_REVIEW: 'warning',
  ONBOARDING: 'neutral',
  ADMIN_REGISTERED: 'neutral',
  REJECTED: 'warning',
  SUSPENDED: 'warning',
};

export default function RegistrationDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useRegistration(id);
  const approve = useApprove();
  const reject = useReject();
  const [provisioned, setProvisioned] = useState<ApproveResult | null>(null);

  const reg = data?.registration;
  const proof = data?.proof;
  const reviewable = reg?.status === 'PENDING_PAYMENT_REVIEW';

  return (
    <div style={{ maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <Link to="/registrations" className="flex gap-8" style={{ alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
          <Icon name="arrow-left" size={15} /> Registrations
        </Link>
        <PageHeader title={reg?.school_name ?? 'Registration'} subtitle="Review the school sign-up and its payment proof, then approve to provision the tenant." />
      </div>

      {isLoading && <Spinner />}
      {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
      {!isLoading && !reg && !error && <EmptyState icon={<Icon name="user-plus" />} title="Not found" desc="This registration no longer exists." />}

      {provisioned && (
        <SectionCard icon="shield" title={`Provisioned · ${provisioned.slug}`} tone="success">
          <div className="row"><span className="muted">Admin login</span><code>{provisioned.admin_login}</code></div>
          <div className="row"><span className="muted">Temp password</span><code>{provisioned.admin_temp_password}</code></div>
          <div className="row"><span className="muted">Invoice</span><span>{provisioned.invoice_number}</span></div>
          <div className="row"><span className="muted">License</span><Badge tone="success">issued</Badge></div>
          <p className="subtle" style={{ fontSize: 12, marginTop: 8 }}>Hand these credentials to the school admin — shown once.</p>
          <div className="mt-16"><Button variant="ghost" onClick={() => setProvisioned(null)}>Dismiss</Button></div>
        </SectionCard>
      )}

      {(approve.error || reject.error) && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(approve.error || reject.error)}</p>
      )}

      {reg && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 24, alignItems: 'start' }}>
          <SectionCard icon="building" title="School" subtitle={`/${reg.slug}`} tone="violet">
            <div className="flex gap-8" style={{ alignItems: 'center' }}>
              <Badge tone={STATUS_TONE[reg.status] ?? 'neutral'}>{reg.status}</Badge>
            </div>
            <div className="row mt-16"><span className="muted">Admin</span><span>{reg.admin_name}</span></div>
            <div className="row"><span className="muted">Email</span><span>{reg.admin_email}</span></div>
            {reg.tenant_id && <div className="row"><span className="muted">Tenant</span><Link to={`/tenants/${reg.tenant_id}`}>{reg.tenant_id}</Link></div>}
            <div className="row"><span className="muted">Registered</span><span>{new Date(reg.created_at).toLocaleString()}</span></div>
          </SectionCard>

          <SectionCard icon="wallet" title="Payment proof" tone="warning">
            {!proof && <p className="muted">No payment proof submitted yet.</p>}
            {proof && (
              <>
                <div className="row"><span className="muted">Status</span><Badge tone={proof.status === 'APPROVED' ? 'success' : proof.status === 'REJECTED' ? 'warning' : 'neutral'}>{proof.status}</Badge></div>
                <div className="row"><span className="muted">Amount</span><span>{proof.currency} {proof.amount.toLocaleString()}</span></div>
                <div className="row"><span className="muted">Method</span><span>{proof.method}</span></div>
                <div className="row"><span className="muted">Txn ID</span><code>{proof.txn_id}</code></div>
                {proof.payer_name && <div className="row"><span className="muted">Payer</span><span>{proof.payer_name}</span></div>}
                {proof.paid_at && <div className="row"><span className="muted">Paid at</span><span>{new Date(proof.paid_at).toLocaleString()}</span></div>}
                {proof.reject_reason && <div className="row"><span className="muted">Reason</span><span>{proof.reject_reason}</span></div>}
              </>
            )}
          </SectionCard>
        </div>
      )}

      {reviewable && (
        <div className="flex gap-8">
          <Button
            disabled={approve.isPending}
            onClick={() => approve.mutate(id, { onSuccess: (res) => setProvisioned(res) })}
          >
            {approve.isPending ? 'Approving…' : 'Approve & provision'}
          </Button>
          <Button
            variant="ghost"
            disabled={reject.isPending}
            onClick={() => {
              const reason = prompt('Reject reason?') || 'rejected';
              reject.mutate({ id, reason }, { onSuccess: () => navigate('/registrations') });
            }}
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
