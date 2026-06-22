// Control-plane dashboard — the superadmin's home. Full-bleed 12-col-feel grid
// (docs/22-frontend.md, docs/23-design-system.md "Premium SaaS Minimalism").
//
// Data provenance — kept honest on the page:
//   LIVE (control plane): pending actions, installed tenants, tenants table,
//     subscription + billing (joined from licenses), licenses issued, top schools by seats.
//   SYNCED ROLLUP (illustrative until the `tenant_stats` slice lands): active users,
//     mobile vs desktop split. These ride the NATS sync stream from each node and can be
//     stale, so every one carries a "synced from nodes" freshness caption. Derived from
//     live counts for now (same approach as AnalyticsPage) — the metrics endpoint replaces them.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Badge,
  Card,
  DataTable,
  HeroBanner,
  Icon,
  PageHeader,
  Spinner,
  Sparkline,
  StatCard,
} from '@/shared/ui';
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
interface Registration {
  status: string;
}

// ── small layout helpers (full-width grids; minmax(0,…) stops content blowout) ──
const split = (a: number, b: number): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `minmax(0, ${a}fr) minmax(0, ${b}fr)`,
  gap: 24,
});

const TENANT_TONE: Record<string, 'success' | 'neutral' | 'warning'> = {
  ACTIVE: 'success',
  PROVISIONED: 'neutral',
  SUSPENDED: 'warning',
  OFFBOARDED: 'neutral',
};

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// SyncCaption — the freshness marker for synced-rollup tiles. Until the stats feed is
// wired this reads "illustrative"; once live it becomes "synced <relative time> ago".
function SyncCaption({ note }: { note?: string }) {
  return (
    <p className="subtle" style={{ fontSize: 12, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--warning)', display: 'inline-block' }} />
      Synced from school nodes · {note ?? 'illustrative until the stats feed lands'}
    </p>
  );
}

// DonutSplit — a lightweight two-slice ring (no charting lib). Mobile vs desktop.
function DonutSplit({ a, b, aLabel, bLabel }: { a: number; b: number; aLabel: string; bLabel: string }) {
  const total = Math.max(a + b, 1);
  const aPct = Math.round((a / total) * 100);
  return (
    <div className="flex gap-24" style={{ alignItems: 'center' }}>
      <div
        style={{
          width: 116,
          height: 116,
          borderRadius: '50%',
          flexShrink: 0,
          background: `conic-gradient(var(--info) 0 ${aPct}%, var(--primary) ${aPct}% 100%)`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--surface)', display: 'grid', placeItems: 'center' }}>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{(total).toLocaleString()}</span>
        </div>
      </div>
      <div className="col gap-12">
        <div className="flex gap-8">
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--info)' }} />
          <span style={{ fontWeight: 600 }}>{aLabel}</span>
          <span className="subtle">{aPct}%</span>
        </div>
        <div className="flex gap-8">
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--primary)' }} />
          <span style={{ fontWeight: 600 }}>{bLabel}</span>
          <span className="subtle">{100 - aPct}%</span>
        </div>
      </div>
    </div>
  );
}

// ActionMenu — the row's ⋮ control. Edit → tenant detail (live). Deactivate is disabled
// until the suspend endpoint is wired (TenantDetailPage scaffold, docs/01 lifecycle).
function ActionMenu({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <div style={{ position: 'relative', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
      <button
        className="btn btn-ghost"
        style={{ height: 32, width: 32, padding: 0 }}
        aria-label="Tenant actions"
        onClick={() => setOpen((v) => !v)}
      >
        ⋮
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 36,
              zIndex: 11,
              minWidth: 168,
              background: 'var(--surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow)',
              padding: 6,
              textAlign: 'left',
            }}
          >
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => navigate(`/tenants/${tenantId}`)}>
              Edit
            </button>
            <button
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              disabled
              title="Suspend endpoint not wired yet (TenantDetailPage scaffold)"
            >
              Deactivate
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const regs = useQueryGet<{ registrations: Registration[] }>(['platform', 'registrations'], '/api/v1/platform/registrations');
  const tenants = useQueryGet<{ tenants: Tenant[] }>(['platform', 'tenants'], '/api/v1/platform/tenants');
  const licenses = useQueryGet<{ licenses: License[] }>(['platform', 'licenses'], '/api/v1/platform/licenses');

  const loading = regs.isLoading || tenants.isLoading || licenses.isLoading;

  const regList = regs.data?.registrations ?? [];
  const tenantList = tenants.data?.tenants ?? [];
  const licList = licenses.data?.licenses ?? [];

  // ── live derived ──
  const pendingRegs = regList.filter((r) => r.status === 'PENDING_PAYMENT_REVIEW').length;
  const installed = tenantList.length;
  const active = tenantList.filter((t) => t.status === 'ACTIVE').length;
  const issuedLicenses = licList.filter((l) => !l.revoked).length;

  // license lookup by tenant slug → subscription plan + billing status for the table.
  const licBySlug = useMemo(() => {
    const m = new Map<string, License>();
    for (const l of licList) if (!l.revoked) m.set(l.tenant_slug, l);
    return m;
  }, [licList]);

  // ── synced rollup (illustrative until tenant_stats) ──
  const activeUsers = active * 34 + installed * 3; // shaped by live counts
  const mobileUsers = Math.round(activeUsers * 0.44);
  const desktopUsers = activeUsers - mobileUsers;
  const trend = Array.from({ length: 8 }, (_, i) => Math.round(Math.max(active, 1) * (0.5 + i * 0.08) + (i % 2)));

  // top schools by licensed seats (live proxy; real student counts arrive via sync).
  const topSchools = useMemo(
    () =>
      tenantList
        .map((t) => ({ ...t, seats: licBySlug.get(t.slug)?.seats ?? 0 }))
        .sort((x, y) => y.seats - x.seats)
        .slice(0, 5),
    [tenantList, licBySlug],
  );

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="The VED platform at a glance — onboarding, tenants, and adoption across the network." />

      {loading ? (
        <Spinner />
      ) : (
        <div className="col gap-24">
          {/* ROW 1 — welcome banner + pending actions */}
          <div style={split(2, 1)}>
            <HeroBanner
              tag="CONTROL PLANE"
              title={`${active} active schools on VED`}
              subtitle="Approve registrations, verify payments, and keep tenants healthy. Everything the platform runs on, in one place."
              action={
                <Link to="/registrations" className="btn btn-primary">
                  Review registrations
                </Link>
              }
            />
            <Card>
              <h3 style={{ fontSize: 14, marginBottom: 12 }}>Pending actions</h3>
              <Link to="/registrations" className="row" style={{ cursor: 'pointer' }}>
                <span className="flex gap-12">
                  <Icon name="user-plus" /> Registrations to review
                </span>
                <Badge tone={pendingRegs ? 'warning' : 'neutral'}>{pendingRegs}</Badge>
              </Link>
              <Link to="/payment-proofs" className="row" style={{ cursor: 'pointer' }}>
                <span className="flex gap-12">
                  <Icon name="wallet" /> Payment proofs to verify
                </span>
                <Badge tone="neutral">queue</Badge>
              </Link>
              <Link to="/licenses" className="row" style={{ cursor: 'pointer' }}>
                <span className="flex gap-12">
                  <Icon name="shield" /> Licenses issued
                </span>
                <Badge tone="success">{issuedLicenses}</Badge>
              </Link>
            </Card>
          </div>

          {/* ROW 2 — four headline stats */}
          <div className="grid-stats">
            <StatCard label="Active users" value={activeUsers.toLocaleString()} accent spark={{ data: trend, tone: 'primary' }} delta={{ value: '+6.2%', dir: 'up', ctx: 'illustrative' }} />
            <StatCard label="Installed tenants" value={installed} spark={{ data: trend, tone: 'info' }} />
            <StatCard label="Mobile app users" value={mobileUsers.toLocaleString()} spark={{ data: trend, tone: 'info' }} />
            <StatCard label="Desktop app users" value={desktopUsers.toLocaleString()} spark={{ data: trend, tone: 'primary' }} />
          </div>
          <SyncCaption note="active users + app split arrive via the stats feed (illustrative)" />

          {/* ROW 3 — trend + platform split */}
          <div style={split(2, 1)}>
            <Card>
              <div className="flex between" style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: 14 }}>Network growth</h3>
                <Badge tone="neutral">last 8 periods</Badge>
              </div>
              <Sparkline data={trend} tone="primary" />
              <SyncCaption />
            </Card>
            <Card>
              <h3 style={{ fontSize: 14, marginBottom: 16 }}>Mobile vs desktop</h3>
              <DonutSplit a={mobileUsers} b={desktopUsers} aLabel="Mobile" bLabel="Desktop" />
            </Card>
          </div>

          {/* ROW 4 — tenants table (full width) */}
          <Card>
            <div className="flex between" style={{ marginBottom: 8 }}>
              <h3 style={{ fontSize: 14 }}>Tenants</h3>
              <Link to="/tenants" className="subtle" style={{ fontSize: 13 }}>
                View all →
              </Link>
            </div>
            <DataTable<Tenant>
              rows={tenantList}
              rowKey={(r) => r.id}
              empty="No tenants provisioned yet."
              columns={[
                {
                  header: 'School',
                  cell: (r) => (
                    <>
                      <Link to={`/tenants/${r.id}`} style={{ fontWeight: 600 }}>
                        {r.name}
                      </Link>
                      <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>/{r.slug}</span>
                    </>
                  ),
                },
                { header: 'Status', cell: (r) => <Badge tone={TENANT_TONE[r.status] ?? 'neutral'}>{r.status}</Badge> },
                {
                  header: 'Subscription',
                  cell: (r) => {
                    const l = licBySlug.get(r.slug);
                    return l ? <Badge tone="primary">{l.plan}</Badge> : <span className="subtle">—</span>;
                  },
                },
                {
                  header: 'Billing',
                  cell: (r) => {
                    const l = licBySlug.get(r.slug);
                    if (!l) return <span className="subtle">No license</span>;
                    const expired = new Date(l.expires_at).getTime() < Date.now();
                    return expired ? (
                      <span style={{ color: 'var(--danger)' }}>Expired {fmtDate(l.expires_at)}</span>
                    ) : (
                      <span className="muted">Paid · expires {fmtDate(l.expires_at)}</span>
                    );
                  },
                },
                { header: '', align: 'right', width: 56, cell: (r) => <ActionMenu tenantId={r.id} /> },
              ]}
            />
          </Card>

          {/* ROW 5 — top schools + licenses issued */}
          <div style={split(7, 5)}>
            <Card>
              <div className="flex gap-8" style={{ marginBottom: 8 }}>
                <h3 style={{ fontSize: 14 }}>Top schools</h3>
                <span className="subtle" style={{ fontSize: 12 }}>by licensed seats</span>
              </div>
              <DataTable<Tenant & { seats: number }>
                rows={topSchools}
                rowKey={(r) => r.id}
                empty="No schools yet."
                columns={[
                  { header: 'School', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
                  { header: 'Status', cell: (r) => <Badge tone={TENANT_TONE[r.status] ?? 'neutral'}>{r.status}</Badge> },
                  { header: 'Seats', align: 'right', cell: (r) => r.seats.toLocaleString() },
                ]}
              />
            </Card>
            <Card>
              <h3 style={{ fontSize: 14, marginBottom: 16 }}>Licenses issued</h3>
              <div className="stat">
                <span className="stat-value stat-accent">{issuedLicenses}</span>
                <span className="muted">active signed licenses</span>
              </div>
              <Link to="/licenses" className="btn btn-secondary mt-16">
                View licenses
              </Link>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// thin wrapper so the page reads cleanly — same react-query pattern as the other pages.
function useQueryGet<T>(key: (string | number)[], path: string) {
  return useQuery({ queryKey: key, queryFn: () => api.get<T>(path) });
}
