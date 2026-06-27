// Issued offline-validatable licenses — lifecycle management for the enforcement tokens
// delivered to nodes. Analytics + distribution donut sit above an enriched, actionable table.
import {
  Badge,
  Column,
  DataTable,
  DonutChart,
  EmptyState,
  Icon,
  PageHeader,
  SectionCard,
  StatCard,
} from '@/shared/ui';
import {
  License,
  useLicenseAction,
  useLicenseAnalytics,
  useLicenses,
} from '../../shared/platformApi';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

function statusTone(status: string): Tone {
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

export default function LicensesPage() {
  const { data, isLoading } = useLicenses();
  const { data: analytics } = useLicenseAnalytics();
  const action = useLicenseAction();

  const licenses = data?.licenses ?? [];
  const pending = action.isPending;

  function runSuspend(l: License) {
    action.mutate({ id: l.id, action: 'suspend' });
  }

  function runResume(l: License) {
    action.mutate({ id: l.id, action: 'resume' });
  }

  function runExtend(l: License) {
    const input = window.prompt('Extend license by how many days?', '30');
    if (input == null) return;
    const days = Number(input);
    if (!Number.isFinite(days) || days <= 0) {
      window.alert('Please enter a positive number of days.');
      return;
    }
    action.mutate({ id: l.id, action: 'extend', body: { days } });
  }

  function runCancel(l: License) {
    if (!window.confirm(`Cancel the license for /${l.tenant_slug} immediately? This cannot be undone.`)) return;
    action.mutate({ id: l.id, action: 'cancel', body: { immediate: true } });
  }

  const columns: Column<License>[] = [
    {
      header: 'Tenant',
      cell: (l) => <span style={{ fontWeight: 600 }}>/{l.tenant_slug}</span>,
    },
    { header: 'Plan', cell: (l) => l.plan },
    { header: 'Seats', align: 'right', cell: (l) => l.seats },
    {
      header: 'Status',
      cell: (l) => <Badge tone={statusTone(l.status)}>{l.status}</Badge>,
    },
    {
      header: 'Auto-Renew',
      cell: (l) => (
        <span>
          {l.auto_renew ? 'Yes' : 'No'}
          {l.cancel_at_period_end && (
            <span className="subtle" style={{ fontSize: 11, marginLeft: 6 }}>
              ends at period
            </span>
          )}
        </span>
      ),
    },
    {
      header: 'Expiry',
      cell: (l) => (
        <span className="subtle" style={{ fontSize: 13 }}>
          {new Date(l.expires_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (l) => (
        <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
          {l.status === 'ACTIVE' && (
            <>
              <button
                type="button"
                className="icon-btn"
                title="Suspend"
                aria-label="Suspend"
                disabled={pending}
                onClick={(e) => {
                  e.stopPropagation();
                  runSuspend(l);
                }}
              >
                <Icon name="shield-off" />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Extend"
                aria-label="Extend"
                disabled={pending}
                onClick={(e) => {
                  e.stopPropagation();
                  runExtend(l);
                }}
              >
                <Icon name="edit" />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Cancel"
                aria-label="Cancel"
                disabled={pending}
                onClick={(e) => {
                  e.stopPropagation();
                  runCancel(l);
                }}
              >
                <Icon name="x" />
              </button>
            </>
          )}
          {l.status === 'SUSPENDED' && (
            <button
              type="button"
              className="icon-btn"
              title="Resume"
              aria-label="Resume"
              disabled={pending}
              onClick={(e) => {
                e.stopPropagation();
                runResume(l);
              }}
            >
              <Icon name="play" />
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader title="Licenses" subtitle="Issued offline-validatable licenses" />

      {analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'stretch' }}>
          {/* Left half (col 6): the four stat cards as a 2×2 grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <StatCard label="Total Licenses" value={analytics.total} tone="violet" icon="shield" />
            <StatCard label="Active" value={analytics.active} tone="success" icon="shield" />
            <StatCard label="Expiring This Month" value={analytics.expiring_this_month} tone="warning" icon="bell" />
            <StatCard label="Cancelled This Month" value={analytics.cancelled_this_month} tone="danger" icon="arrow-left" />
          </div>
          {/* Right half (col 6): License Distribution */}
          <SectionCard icon="chart" title="License Distribution" tone="info">
            <DonutChart data={analytics.distribution} />
          </SectionCard>
        </div>
      )}

      <SectionCard icon="shield" title="Issued Licenses" tone="primary">
        {!isLoading && licenses.length === 0 ? (
          <EmptyState
            icon={<Icon name="shield" />}
            title="No licenses issued yet"
            desc="Licenses appear here once a tenant registration is approved and provisioned."
          />
        ) : (
          <DataTable<License>
            columns={columns}
            rows={licenses}
            rowKey={(l) => l.id}
            loading={isLoading}
            empty="No licenses issued yet."
            searchable
            searchText={(l) => `${l.tenant_slug} ${l.plan} ${l.status}`}
          />
        )}
      </SectionCard>
    </div>
  );
}
