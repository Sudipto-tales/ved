// Control-plane dashboard — the superadmin's home. Premium SaaS Minimalism
// (docs/22-frontend.md, docs/23-design-system.md). The whole page is fed by the
// single `useDashboard()` rollup endpoint (server platform_v2): six headline KPIs on
// top, three analytics charts in the middle, and two recent-activity tables below.
import {
  Badge,
  DataTable,
  DonutChart,
  PageHeader,
  PixelField,
  SectionCard,
  Spinner,
  StatCard,
  TrendChart,
} from '@/shared/ui';
import { useDashboard } from '../../shared/platformApi';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const money = (n: number) => inr.format(n);

function fmtDate(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'info';
function statusTone(status: string): Tone {
  const s = status.toUpperCase();
  if (s === 'ACTIVE' || s === 'APPROVED') return 'success';
  if (s.startsWith('PENDING') || s === 'INFO_REQUESTED') return 'warning';
  if (s === 'REJECTED') return 'danger' as Tone;
  return 'neutral';
}

interface RecentRegistration {
  id: string;
  school_name: string;
  slug: string;
  status: string;
  created_at: string;
}
interface RecentProof {
  id: string;
  school_name: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Platform overview" />
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Platform overview" />
        <p style={{ color: 'var(--danger)', fontSize: 13 }}>Failed to load dashboard: {String(error)}</p>
      </div>
    );
  }

  return (
    <div className="col gap-24">
      {/* Animated pixel-field banner (decorative, living background) */}
      <PixelField style={{ boxShadow: 'var(--shadow)' }}>
        <div style={{ padding: '34px 36px' }}>
          <div style={{ fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)' }}>
            Control Plane
          </div>
          <h2 style={{ color: '#fff', fontSize: 28, marginTop: 10 }}>Platform Overview</h2>
          <p style={{ color: 'rgba(255,255,255,.72)', marginTop: 8, maxWidth: '52ch' }}>
            Tenants, revenue, licensing and registrations across every school — at a glance.
          </p>
        </div>
      </PixelField>

      {/* TOP ZONE — six headline KPIs, each a distinct tone+icon */}
      <div className="grid-stats">
        <StatCard label="Total Tenants" value={data.total_tenants.toLocaleString()} tone="violet" icon="building" />
        <StatCard label="Active Subscriptions" value={data.active_subscriptions.toLocaleString()} tone="primary" icon="layers" />
        <StatCard label="Monthly Revenue" value={money(data.monthly_revenue)} tone="success" icon="wallet" />
        <StatCard label="Pending Requests" value={data.pending_requests.toLocaleString()} tone="warning" icon="user-plus" />
        <StatCard label="Expiring Licenses" value={data.expiring_licenses.toLocaleString()} tone="danger" icon="shield" />
        <StatCard label="Open Support Tickets" value={data.open_support_tickets.toLocaleString()} tone="info" icon="bell" />
      </div>

      {/* MIDDLE ZONE — three analytics charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
        <SectionCard icon="chart" title="Registration Trend" subtitle="new schools over time" tone="violet">
          <TrendChart data={data.registration_trend} />
        </SectionCard>
        <SectionCard icon="wallet" title="Revenue Trend" subtitle="monthly revenue" tone="success">
          <TrendChart data={data.revenue_trend} tone="#00b8d9" />
        </SectionCard>
        <SectionCard icon="shield" title="License Distribution" subtitle="by plan" tone="info">
          <DonutChart data={data.license_distribution} />
        </SectionCard>
      </div>

      {/* BOTTOM ZONE — recent activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
        <SectionCard icon="building" title="Recent Registrations" subtitle="latest schools" tone="primary">
          <DataTable<RecentRegistration>
            rows={data.recent_registrations}
            rowKey={(r) => r.id}
            empty="No registrations yet."
            columns={[
              { header: 'School', cell: (r) => <span style={{ fontWeight: 600 }}>{r.school_name}</span> },
              { header: 'Slug', cell: (r) => <span className="subtle">/{r.slug}</span> },
              { header: 'Status', cell: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
              { header: 'Created', align: 'right', cell: (r) => fmtDate(r.created_at) },
            ]}
          />
        </SectionCard>
        <SectionCard icon="wallet" title="Recent Payments" subtitle="latest proofs" tone="warning">
          <DataTable<RecentProof>
            rows={data.recent_proofs}
            rowKey={(r) => r.id}
            empty="No payments yet."
            columns={[
              { header: 'School', cell: (r) => <span style={{ fontWeight: 600 }}>{r.school_name}</span> },
              { header: 'Amount', align: 'right', cell: (r) => money(r.amount) },
              { header: 'Status', cell: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
              { header: 'Created', align: 'right', cell: (r) => fmtDate(r.created_at) },
            ]}
          />
        </SectionCard>
      </div>
    </div>
  );
}
