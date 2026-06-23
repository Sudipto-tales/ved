// Subscriptions — revenue & customer analytics for the platform super-admin. Read-only over
// GET /api/v1/platform/subscriptions/analytics. License health lives on the Licenses page.
import { BarSeries, DonutChart, PageHeader, SectionCard, Spinner, StatCard, TrendChart } from '@/shared/ui';
import { useSubscriptionAnalytics } from '../../shared/platformApi';
import { PlansPanel } from '../plans/PlansPage';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const KPI_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 } as const;
const CHARTS_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 } as const;

export default function SubscriptionsPage() {
  const { data, isLoading, error } = useSubscriptionAnalytics();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader title="Subscriptions" subtitle="Revenue, customers & plan catalog" />
      {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}

      {isLoading && <Spinner />}

      {!isLoading && data && (
        <>
          {/* One consolidated KPI row — the meaningful revenue + customer numbers */}
          <div style={KPI_GRID}>
            <StatCard
              label="MRR"
              tone="success"
              icon="wallet"
              value={inr.format(data.mrr)}
              delta={{ value: `${Math.abs(data.growth_pct)}%`, dir: data.growth_pct >= 0 ? 'up' : 'down', ctx: 'vs last month' }}
            />
            <StatCard label="ARR" tone="primary" icon="chart" value={inr.format(data.arr)} />
            <StatCard label="Active Tenants" tone="info" icon="building" value={data.active_tenants} />
            <StatCard label="New Tenants" tone="violet" icon="user-plus" value={data.new_tenants} delta={{ value: `${data.new_tenants}`, dir: 'up', ctx: 'this month' }} />
            <StatCard label="Churn Rate" tone="danger" icon="chart" value={`${data.churn_rate_pct}%`} />
          </div>

          <div style={CHARTS_GRID}>
            <SectionCard icon="wallet" title="Revenue Trend" subtitle="last 6 months" tone="success">
              <TrendChart data={data.revenue_trend} height={220} />
            </SectionCard>
            <SectionCard icon="chart" title="Subscription Growth" subtitle="net new / month" tone="primary">
              <BarSeries data={data.subscription_growth} height={220} />
            </SectionCard>
            <SectionCard icon="layers" title="Plan Popularity" subtitle="active subscriptions by plan" tone="violet">
              <DonutChart data={data.plan_popularity} height={220} />
            </SectionCard>
          </div>
        </>
      )}

      {/* Plans & Prices — managed inline here; no separate page */}
      <PlansPanel />
    </div>
  );
}
