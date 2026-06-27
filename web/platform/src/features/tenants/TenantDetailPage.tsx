// A single provisioned school — resolved from the enriched tenants directory, with its
// billing history (invoices + payment proofs). Suspend / resume act from the header, and
// "Manage License" deep-links into the Licenses workspace.
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, DataTable, EmptyState, Icon, PageHeader, SectionCard, Spinner, Toolbar } from '@/shared/ui';
import {
  tenantUrl,
  useTenantAction,
  useTenantBilling,
  useTenantsEnriched,
  type BillingHistory,
  type TenantRow,
} from '../../shared/platformApi';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function licenseTone(status?: string | null): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'SUSPENDED':
      return 'warning';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'danger';
    default:
      return 'neutral';
  }
}

function statusTone(status: string): 'success' | 'warning' | 'neutral' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'SUSPENDED':
      return 'warning';
    default:
      return 'neutral';
  }
}

type Invoice = BillingHistory['invoices'][number];
type Proof = BillingHistory['proofs'][number];

export default function TenantDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const tenants = useTenantsEnriched();
  const billing = useTenantBilling(id);
  const action = useTenantAction();

  const tenant = tenants.data?.tenants.find((t) => t.id === id);

  function onAction(t: TenantRow) {
    if (t.status === 'SUSPENDED') {
      action.mutate({ id: t.id, action: 'resume' });
      return;
    }
    if (window.confirm(`Suspend ${t.name}? The node will be locked out until resumed.`)) {
      action.mutate({ id: t.id, action: 'suspend' });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Link to="/tenants" className="flex gap-8" style={{ alignItems: 'center', fontSize: 13 }}>
        <Icon name="arrow-left" size={15} /> Tenants
      </Link>
      <PageHeader title={tenant?.name ?? 'Tenant'} subtitle="A provisioned school node, its license, and its billing history." />

      {tenants.isLoading && !tenant && <Spinner />}
      {tenants.error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(tenants.error)}</p>}
      {!tenants.isLoading && !tenant && <EmptyState icon={<Icon name="building" />} title="Not found" desc="No tenant with that id." />}

      {tenant && (
        <>
          <Toolbar>
            <span className="grow" />
            <Button variant="secondary" onClick={() => window.open(tenantUrl(tenant.slug), '_blank')}>
              Visit site
            </Button>
            <Button variant="secondary" onClick={() => window.open(tenantUrl(tenant.slug, true), '_blank')}>
              Open admin
            </Button>
            <Button variant="secondary" onClick={() => navigate('/licenses')}>
              Manage License
            </Button>
            <Button
              variant={tenant.status === 'SUSPENDED' ? 'primary' : 'secondary'}
              disabled={action.isPending}
              onClick={() => onAction(tenant)}
            >
              {tenant.status === 'SUSPENDED' ? 'Resume' : 'Suspend'}
            </Button>
          </Toolbar>

          <SectionCard icon="building" title="Overview" tone="violet">
            <div className="flex gap-8" style={{ alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{tenant.name}</span>
              <span className="subtle" style={{ fontSize: 12 }}>/{tenant.slug}</span>
              <Badge tone={statusTone(tenant.status)}>{tenant.status}</Badge>
            </div>
            <div className="row mt-16"><span className="muted">Admin</span><span>{tenant.admin_name ?? '—'}</span></div>
            <div className="row">
              <span className="muted">Email</span>
              {tenant.admin_email ? <a href={`mailto:${tenant.admin_email}`}>{tenant.admin_email}</a> : <span>—</span>}
            </div>
            <div className="row"><span className="muted">Tenant ID</span><code>{tenant.id}</code></div>
            <div className="row"><span className="muted">Plan</span><span>{tenant.plan ?? '—'}</span></div>
            <div className="row">
              <span className="muted">License</span>
              {tenant.license_status ? (
                <Badge tone={licenseTone(tenant.license_status)}>{tenant.license_status}</Badge>
              ) : (
                <span>—</span>
              )}
            </div>
            <div className="row"><span className="muted">Subscription</span><span>{tenant.subscription_status ?? '—'}</span></div>
            <div className="row"><span className="muted">Users</span><span>{tenant.users}</span></div>
            {tenant.license_expires_at && (
              <div className="row"><span className="muted">License expires</span><span>{new Date(tenant.license_expires_at).toLocaleDateString()}</span></div>
            )}
            {tenant.provisioned_at && (
              <div className="row"><span className="muted">Provisioned</span><span>{new Date(tenant.provisioned_at).toLocaleString()}</span></div>
            )}
          </SectionCard>

          <SectionCard icon="wallet" title="Invoices" tone="success">
            <DataTable<Invoice>
              loading={billing.isLoading}
              rows={billing.data?.invoices ?? []}
              rowKey={(i) => i.id}
              empty={<EmptyState icon={<Icon name="book" />} title="No invoices" desc="No invoices have been issued for this tenant." />}
              columns={[
                { header: 'Number', cell: (i) => i.number },
                { header: 'Period', cell: (i) => i.period ?? '—' },
                { header: 'Total', align: 'right', cell: (i) => inr.format(i.total) },
                { header: 'Status', cell: (i) => <Badge tone={i.status === 'PAID' ? 'success' : 'neutral'}>{i.status}</Badge> },
                { header: 'Issued', align: 'right', cell: (i) => new Date(i.issued_at).toLocaleDateString() },
              ]}
            />
          </SectionCard>

          <SectionCard icon="note" title="Payment Proofs" tone="info">
            <DataTable<Proof>
              loading={billing.isLoading}
              rows={billing.data?.proofs ?? []}
              rowKey={(p) => p.id}
              empty={<EmptyState icon={<Icon name="wallet" />} title="No payment proofs" desc="No payment proofs have been submitted for this tenant." />}
              columns={[
                { header: 'Txn ID', cell: (p) => <code>{p.txn_id}</code> },
                { header: 'Amount', align: 'right', cell: (p) => inr.format(p.amount) },
                { header: 'Method', cell: (p) => p.method },
                { header: 'Status', cell: (p) => <Badge tone={p.status === 'APPROVED' ? 'success' : p.status === 'REJECTED' ? 'danger' : 'neutral'}>{p.status}</Badge> },
                { header: 'Created', align: 'right', cell: (p) => new Date(p.created_at).toLocaleDateString() },
              ]}
            />
          </SectionCard>
        </>
      )}
    </div>
  );
}
