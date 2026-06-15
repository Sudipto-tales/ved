// The superadmin review queue (M4 state machine). Approve runs the whole chain —
// tenant + subscription + gapless invoice + signed license + tenant-plane provisioning —
// and returns the new school admin's one-time credentials, shown once here.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, PageHeader, Spinner } from '@/shared/ui';
import { useRegistrations, useApprove, useReject, type ApproveResult } from './api';

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'warning'> = {
  ACTIVE: 'success',
  PENDING_PAYMENT_REVIEW: 'warning',
  ONBOARDING: 'neutral',
  ADMIN_REGISTERED: 'neutral',
  REJECTED: 'warning',
  SUSPENDED: 'warning',
};

export default function RegistrationsPage() {
  const { data, isLoading, error } = useRegistrations();
  const approve = useApprove();
  const reject = useReject();
  const [provisioned, setProvisioned] = useState<ApproveResult | null>(null);

  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader title="Registrations" subtitle="Review school sign-ups. Approving provisions the tenant, signs a license, and creates the first admin." />

      {provisioned && (
        <Card className="mt-16" style={{ borderColor: 'var(--accent)' }}>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Provisioned · {provisioned.slug}</h3>
          <div className="row"><span className="muted">Admin login</span><code>{provisioned.admin_login}</code></div>
          <div className="row"><span className="muted">Temp password</span><code>{provisioned.admin_temp_password}</code></div>
          <div className="row"><span className="muted">Invoice</span><span>{provisioned.invoice_number}</span></div>
          <div className="row"><span className="muted">License</span><Badge tone="success">issued</Badge></div>
          <p className="subtle" style={{ fontSize: 12, marginTop: 8 }}>Hand these credentials to the school admin — shown once.</p>
          <div className="mt-16"><Button variant="ghost" onClick={() => setProvisioned(null)}>Dismiss</Button></div>
        </Card>
      )}

      {(approve.error || reject.error) && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(approve.error || reject.error)}</p>
      )}

      <Card className="mt-16">
        {isLoading && <Spinner />}
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        {!isLoading && (data?.registrations.length ?? 0) === 0 && <p className="muted">No registrations yet.</p>}
        {data?.registrations.map((r) => (
          <div className="row" key={r.id} style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div className="flex gap-8" style={{ alignItems: 'center' }}>
                <Link to={`/registrations/${r.id}`} style={{ fontWeight: 600 }}>{r.school_name}</Link>
                <span className="subtle" style={{ fontSize: 12 }}>/{r.slug}</span>
                <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge>
                {r.proof_status && <Badge tone="neutral">proof {r.proof_status}</Badge>}
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>{r.admin_name} · {r.admin_email}</div>
            </div>
            {r.status === 'PENDING_PAYMENT_REVIEW' && (
              <div className="flex gap-8">
                <Button
                  disabled={approve.isPending}
                  onClick={() => approve.mutate(r.id, { onSuccess: (res) => setProvisioned(res) })}
                >
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  disabled={reject.isPending}
                  onClick={() => {
                    const reason = prompt('Reject reason?') || 'rejected';
                    reject.mutate({ id: r.id, reason });
                  }}
                >
                  Reject
                </Button>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
