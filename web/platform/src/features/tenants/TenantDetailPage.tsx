// A single provisioned school — resolved from the tenants directory, with its issued
// licenses (filtered from GET /platform/licenses by slug). Read-only for now; suspend /
// offboard actions are a later refinement.
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Badge, Card, DataTable, EmptyState, Icon, PageHeader, Spinner } from '@/shared/ui';
import { api } from '../../shared/api';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  provisioned_at?: string;
}
interface License {
  id: string;
  tenant_slug: string;
  plan: string;
  seats: number;
  issued_at: string;
  expires_at: string;
  revoked: boolean;
}

export default function TenantDetailPage() {
  const { id = '' } = useParams();
  const tenants = useQuery({
    queryKey: ['platform', 'tenants'],
    queryFn: () => api.get<{ tenants: Tenant[] }>('/api/v1/platform/tenants'),
  });
  const licenses = useQuery({
    queryKey: ['platform', 'licenses'],
    queryFn: () => api.get<{ licenses: License[] }>('/api/v1/platform/licenses'),
  });

  const tenant = tenants.data?.tenants.find((t) => t.id === id);
  const tenantLicenses = (licenses.data?.licenses ?? []).filter((l) => tenant && l.tenant_slug === tenant.slug);

  return (
    <div style={{ maxWidth: 820 }}>
      <Link to="/tenants" className="flex gap-8" style={{ alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
        <Icon name="arrow-left" size={15} /> Tenants
      </Link>
      <PageHeader title={tenant?.name ?? 'Tenant'} subtitle="A provisioned school node and the licenses issued to it." />

      {tenants.isLoading && <Spinner />}
      {tenants.error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(tenants.error)}</p>}
      {!tenants.isLoading && !tenant && <EmptyState icon={<Icon name="building" />} title="Not found" desc="No tenant with that id." />}

      {tenant && (
        <Card className="mt-16">
          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{tenant.name}</span>
            <span className="subtle" style={{ fontSize: 12 }}>/{tenant.slug}</span>
            <Badge tone={tenant.status === 'ACTIVE' ? 'success' : 'neutral'}>{tenant.status}</Badge>
          </div>
          <div className="row mt-16"><span className="muted">Tenant ID</span><code>{tenant.id}</code></div>
          {tenant.provisioned_at && <div className="row"><span className="muted">Provisioned</span><span>{new Date(tenant.provisioned_at).toLocaleString()}</span></div>}
        </Card>
      )}

      {tenant && (
        <Card className="mt-16">
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Licenses</h3>
          <DataTable<License>
            loading={licenses.isLoading}
            rows={tenantLicenses}
            rowKey={(l) => l.id}
            empty={<EmptyState icon={<Icon name="shield" />} title="No licenses" desc="No licenses have been issued for this tenant." />}
            columns={[
              { header: 'Plan', cell: (l) => l.plan },
              { header: 'Seats', align: 'right', cell: (l) => l.seats },
              { header: 'Issued', cell: (l) => new Date(l.issued_at).toLocaleDateString() },
              { header: 'Expires', cell: (l) => new Date(l.expires_at).toLocaleDateString() },
              { header: 'Status', align: 'right', cell: (l) => <Badge tone={l.revoked ? 'warning' : 'success'}>{l.revoked ? 'revoked' : 'active'}</Badge> },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
