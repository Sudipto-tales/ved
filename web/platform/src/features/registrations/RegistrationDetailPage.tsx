// Single-registration review — the school's details + its submitted payment proof, with
// approve / reject driven from here. Approving runs the full M4 chain (tenant + subscription
// + gapless invoice + signed license + tenant-plane provisioning) and returns the new
// admin's one-time credentials, shown once.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, EmptyState, Icon, PageHeader, SectionCard, Spinner } from '@/shared/ui';
import { useApprove, useRegistration, useReject, type ApproveResult } from './api';
import { tenantUrl, useRegistrationFormConfig, useSetKYC } from '../../shared/platformApi';

const KYC_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  VERIFIED: 'success',
  PENDING: 'warning',
  REJECTED: 'danger',
};

const RISK_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  MEDIUM: 'warning',
  HIGH: 'danger',
};

function riskBand(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score >= 67) return 'HIGH';
  if (score >= 34) return 'MEDIUM';
  return 'LOW';
}

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
  const setKYC = useSetKYC();
  const formConfig = useRegistrationFormConfig();
  const [provisioned, setProvisioned] = useState<ApproveResult | null>(null);

  const reg = data?.registration;
  const proof = data?.proof;
  const kyc = data?.kyc;
  const reviewable = reg?.status === 'PENDING_PAYMENT_REVIEW';

  // Label custom-field answers via the registration-form template (fall back to the key).
  const labelFor = (key: string) => formConfig.data?.fields.find((f) => f.field_key === key)?.label ?? key;
  const extras = Object.entries(data?.extra_fields ?? {}).filter(([, v]) => v !== null && v !== '' && v !== undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
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
          {provisioned.magic_token && (
            <div className="row">
              <span className="muted">Activation link</span>
              <a href={`${tenantUrl(provisioned.slug)}/activate?token=${provisioned.magic_token}`} target="_blank" rel="noreferrer">
                <code style={{ wordBreak: 'break-all' }}>{`${tenantUrl(provisioned.slug)}/activate?token=${provisioned.magic_token}`}</code>
              </a>
            </div>
          )}
          <p className="subtle" style={{ fontSize: 12, marginTop: 8 }}>Hand these credentials (or the one-click activation link) to the school admin — shown once.</p>
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

          <div style={{ gridColumn: '1 / -1' }}>
          <SectionCard icon="shield" title="KYC & risk" tone="info">
            {!kyc && <p className="muted">No KYC data submitted yet.</p>}
            {kyc && (
              <>
                <div className="row">
                  <span className="muted">Status</span>
                  <Badge tone={KYC_TONE[kyc.status] ?? 'neutral'}>{kyc.status}</Badge>
                </div>
                <div className="row">
                  <span className="muted">Risk score</span>
                  <span className="flex gap-8" style={{ alignItems: 'center' }}>
                    <Badge tone={RISK_TONE[riskBand(kyc.risk_score)]}>{riskBand(kyc.risk_score)}</Badge>
                    <span>{kyc.risk_score}</span>
                  </span>
                </div>
                {kyc.business_reg && <div className="row"><span className="muted">Business reg.</span><code>{kyc.business_reg}</code></div>}
                {kyc.gst && <div className="row"><span className="muted">GST</span><code>{kyc.gst}</code></div>}
                <div className="row"><span className="muted">Source</span><span>{kyc.source}{kyc.source_detail ? ` · ${kyc.source_detail}` : ''}</span></div>
                {kyc.notes && <div className="row"><span className="muted">Notes</span><span>{kyc.notes}</span></div>}
                {kyc.risk_factors.length > 0 && (
                  <div className="mt-16">
                    <span className="muted" style={{ fontSize: 12 }}>Risk factors</span>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
                      {kyc.risk_factors.map((f: string) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex gap-8 mt-16">
                  <Button
                    disabled={setKYC.isPending || kyc.status === 'VERIFIED'}
                    onClick={() => setKYC.mutate({ id, status: 'VERIFIED' })}
                  >
                    {setKYC.isPending ? 'Saving…' : 'Verify KYC'}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={setKYC.isPending || kyc.status === 'REJECTED'}
                    onClick={() => {
                      const notes = prompt('Reason for rejecting KYC?') || undefined;
                      setKYC.mutate({ id, status: 'REJECTED', notes });
                    }}
                  >
                    Reject KYC
                  </Button>
                </div>
                {setKYC.error && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{String(setKYC.error)}</p>}
              </>
            )}
          </SectionCard>
          </div>

          {extras.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <SectionCard icon="note" title="Custom fields" subtitle="Answers to superadmin-defined registration fields." tone="info">
                {extras.map(([key, val]) => (
                  <div className="row" key={key}>
                    <span className="muted">{labelFor(key)}</span>
                    <span>{String(val)}</span>
                  </div>
                ))}
              </SectionCard>
            </div>
          )}
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
