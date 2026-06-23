// The tenant directory — every school the platform has provisioned, enriched with plan,
// license, subscription and seat-usage columns. Suspend / resume act directly from the row.
import { useNavigate } from 'react-router-dom';
import { Badge, DataTable, Icon, PageHeader, SectionCard, Spinner } from '@/shared/ui';
import { tenantUrl, useTenantAction, useTenantsEnriched, type TenantRow } from '../../shared/platformApi';

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

export default function TenantsPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useTenantsEnriched();
  const action = useTenantAction();

  function onAction(e: React.MouseEvent, t: TenantRow) {
    e.stopPropagation();
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
      <PageHeader title="Tenants" subtitle="Every provisioned school. A node binds to exactly one tenant by its immutable slug." />
      <SectionCard icon="building" title="Provisioned Schools" tone="violet">
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<TenantRow>
          loading={isLoading && !data}
          rows={data?.tenants ?? []}
          rowKey={(t) => t.id}
          searchable
          searchText={(t) =>
            `${t.name} ${t.slug} ${t.plan ?? ''} ${t.status} ${t.subscription_status ?? ''} ${t.license_status ?? ''}`
          }
          onRowClick={(t) => navigate(`/tenants/${t.id}`)}
          empty="No tenants provisioned yet."
          columns={[
            {
              header: 'Tenant',
              cell: (t) => (
                <div>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div className="subtle" style={{ fontSize: 12 }}>/{t.slug}</div>
                </div>
              ),
            },
            { header: 'Plan', cell: (t) => t.plan ?? '—' },
            {
              header: 'License',
              cell: (t) =>
                t.license_status ? (
                  <Badge tone={licenseTone(t.license_status)}>{t.license_status}</Badge>
                ) : (
                  <span className="muted">—</span>
                ),
            },
            { header: 'Users', align: 'right', cell: (t) => t.users },
            {
              header: 'Subscription',
              cell: (t) =>
                t.subscription_status ? <Badge tone="info">{t.subscription_status}</Badge> : <span className="muted">—</span>,
            },
            {
              header: 'Status',
              cell: (t) => <Badge tone={statusTone(t.status)}>{t.status}</Badge>,
            },
            {
              header: 'Actions',
              align: 'right',
              cell: (t) => (
                <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Visit tenant site"
                    aria-label="Visit tenant site"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(tenantUrl(t.slug), '_blank');
                    }}
                  >
                    <Icon name="external" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={action.isPending}
                    title={t.status === 'SUSPENDED' ? 'Resume tenant' : 'Suspend tenant'}
                    aria-label={t.status === 'SUSPENDED' ? 'Resume tenant' : 'Suspend tenant'}
                    onClick={(e) => onAction(e, t)}
                  >
                    <Icon name={t.status === 'SUSPENDED' ? 'play' : 'shield-off'} />
                  </button>
                </span>
              ),
            },
          ]}
        />
        {isLoading && data && <Spinner />}
      </SectionCard>
    </div>
  );
}
