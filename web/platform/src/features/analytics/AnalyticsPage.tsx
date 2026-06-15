// Cross-School Analytics — a polished platform overview. Headline metrics are derived
// from live counts (tenants / registrations / licenses); revenue + trend figures are
// ILLUSTRATIVE (computed from those counts) until a metrics endpoint exists.
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, DataTable, HeroBanner, Icon, PageHeader, Spinner, Sparkline, StatCard } from '@/shared/ui';
import { api } from '../../shared/api';

interface Tenant { status: string; }
interface License { revoked: boolean; plan: string; seats: number; }

export default function AnalyticsPage() {
  const tenants = useQuery({ queryKey: ['platform', 'tenants'], queryFn: () => api.get<{ tenants: Tenant[] }>('/api/v1/platform/tenants') });
  const regs = useQuery({ queryKey: ['platform', 'registrations'], queryFn: () => api.get<{ registrations: { status: string }[] }>('/api/v1/platform/registrations') });
  const licenses = useQuery({ queryKey: ['platform', 'licenses'], queryFn: () => api.get<{ licenses: License[] }>('/api/v1/platform/licenses') });

  const loading = tenants.isLoading || regs.isLoading || licenses.isLoading;

  const tenantList = tenants.data?.tenants ?? [];
  const regList = regs.data?.registrations ?? [];
  const licList = licenses.data?.licenses ?? [];

  const active = tenantList.filter((t) => t.status === 'ACTIVE').length;
  const pending = regList.filter((r) => r.status === 'PENDING_PAYMENT_REVIEW').length;
  const activeLicenses = licList.filter((l) => !l.revoked).length;
  // Illustrative MRR: active licenses × an assumed average — placeholder until metrics land.
  const seats = licList.reduce((n, l) => n + (l.seats ?? 0), 0);
  const mrr = activeLicenses * 4999;

  // Illustrative 8-point trend shaped by the live totals.
  const base = Math.max(active, 1);
  const trend = Array.from({ length: 8 }, (_, i) => Math.round(base * (0.5 + i * 0.08) + (i % 2)));

  // Revenue-by-plan, illustrative (count of licenses per plan).
  const byPlan = Object.entries(
    licList.reduce<Record<string, number>>((acc, l) => { acc[l.plan] = (acc[l.plan] ?? 0) + 1; return acc; }, {}),
  ).map(([plan, count]) => ({ plan, count }));

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader title="Cross-School Analytics" subtitle="Platform health at a glance. Revenue and trend figures are illustrative until a metrics service is wired." />

      <div className="mt-16">
        <HeroBanner
          tag="PLATFORM"
          title={loading ? 'Loading…' : `${active} active schools`}
          subtitle="Adoption across the network. Drill into tenants and licenses for the detail."
        />
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="grid-stats mt-16">
            <StatCard label="Active schools" value={active} accent spark={{ data: trend, tone: 'primary' }} delta={{ value: '+8.4%', dir: 'up', ctx: 'illustrative' }} />
            <StatCard label="MRR (illustrative)" value={`₹${mrr.toLocaleString()}`} spark={{ data: trend, tone: 'info' }} delta={{ value: '+3.1%', dir: 'up', ctx: 'last 30 days' }} />
            <StatCard label="Pending review" value={pending} delta={pending > 0 ? { value: `${pending}`, dir: 'up', ctx: 'awaiting' } : undefined} />
            <StatCard label="Active licenses" value={<Badge tone="success">{activeLicenses}</Badge>} />
          </div>

          <div className="grid-stats mt-16">
            <StatCard label="Registrations (total)" value={regList.length} />
            <StatCard label="Seats licensed" value={seats.toLocaleString()} />
            <StatCard label="Conversion (illustrative)" value={`${regList.length ? Math.round((active / regList.length) * 100) : 0}%`} />
          </div>

          <Card className="mt-16">
            <div className="flex gap-8" style={{ alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ fontSize: 14 }}>Licenses by plan</h3>
              <Sparkline data={trend} tone="primary" />
            </div>
            <DataTable<{ plan: string; count: number }>
              rows={byPlan}
              rowKey={(r) => r.plan}
              empty={<span className="muted">No licenses issued yet.</span>}
              columns={[
                { header: 'Plan', cell: (r) => <span style={{ fontWeight: 600 }}>{r.plan}</span> },
                { header: 'Licenses', align: 'right', cell: (r) => r.count },
                { header: 'Share', align: 'right', cell: (r) => `${licList.length ? Math.round((r.count / licList.length) * 100) : 0}%` },
              ]}
            />
          </Card>

          <p className="subtle" style={{ fontSize: 12, marginTop: 12 }}>
            <Icon name="chart" size={13} /> MRR, conversion, and trend are derived placeholders — a dedicated platform metrics endpoint replaces them later.
          </p>
        </>
      )}
    </div>
  );
}
