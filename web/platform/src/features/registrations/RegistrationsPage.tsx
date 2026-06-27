// The superadmin review queue (M4 state machine). Approve runs the whole chain —
// tenant + subscription + gapless invoice + signed license + tenant-plane provisioning —
// and returns the new school admin's one-time credentials, shown once here. This page
// also surfaces registration analytics (volume, funnel, approval rate) and a Send
// Reminder action for in-flight sign-ups.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  BarSeries,
  DataTable,
  DotChart,
  Icon,
  PageHeader,
  SectionCard,
  Spinner,
  StatCard,
  Tabs,
  type Column,
} from '@/shared/ui';
import { useRegistrations, type Registration } from './api';
import { useRegistrationAnalytics, useRemindRegistration } from '../../shared/platformApi';

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  REJECTED: 'danger',
  PENDING_PAYMENT_REVIEW: 'warning',
  ONBOARDING: 'warning',
  ADMIN_REGISTERED: 'warning',
  SUSPENDED: 'warning',
};

// M11: KYC review surfaces a coarse risk band and the lead's acquisition source.
const RISK_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  MEDIUM: 'warning',
  HIGH: 'danger',
};

const KYC_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  VERIFIED: 'success',
  PENDING: 'warning',
  REJECTED: 'danger',
};

type FilterId = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW';

const FILTER_TABS: { id: FilterId; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'UNDER_REVIEW', label: 'Under Review' },
];

const PENDING_STATUSES = ['ADMIN_REGISTERED', 'ONBOARDING'];

function matchesFilter(filter: FilterId, status: string): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'PENDING':
      return PENDING_STATUSES.includes(status);
    case 'UNDER_REVIEW':
      return status === 'PENDING_PAYMENT_REVIEW';
    case 'APPROVED':
      return status === 'ACTIVE';
    case 'REJECTED':
      return status === 'REJECTED';
    default:
      return true;
  }
}

// Remind is only meaningful while a sign-up is still in flight.
function canRemind(status: string): boolean {
  return status !== 'ACTIVE' && status !== 'REJECTED';
}

export default function RegistrationsPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useRegistrations();
  const analytics = useRegistrationAnalytics();
  const remind = useRemindRegistration();
  const [filter, setFilter] = useState<FilterId>('ALL');
  const [remindedId, setRemindedId] = useState<string | null>(null);

  const a = analytics.data;
  const registrations = data?.registrations ?? [];
  const filtered = useMemo(
    () => registrations.filter((r) => matchesFilter(filter, r.status)),
    [registrations, filter],
  );

  const sendReminder = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    remind.mutate(id, { onSuccess: () => setRemindedId(id) });
  };

  const columns: Column<Registration>[] = [
    {
      header: 'School',
      cell: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.school_name}</div>
          <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>/{r.slug}</div>
        </div>
      ),
    },
    {
      header: 'Admin',
      cell: (r) => (
        <div>
          <div>{r.admin_name}</div>
          <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>{r.admin_email}</div>
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (r) => (
        <div className="flex gap-8" style={{ alignItems: 'center' }}>
          <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge>
          {r.proof_status && <Badge tone="neutral">proof {r.proof_status}</Badge>}
        </div>
      ),
    },
    {
      header: 'KYC',
      cell: (r) =>
        r.kyc_status ? (
          <Badge tone={KYC_TONE[r.kyc_status] ?? 'neutral'}>{r.kyc_status}</Badge>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      header: 'Risk',
      cell: (r) =>
        r.risk_score ? (
          <Badge tone={RISK_TONE[r.risk_score] ?? 'neutral'}>{r.risk_score}</Badge>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      header: 'Source',
      cell: (r) => (r.source ? <span style={{ fontSize: 13 }}>{r.source}</span> : <span className="muted">—</span>),
    },
    {
      header: '',
      align: 'right',
      cell: (r) =>
        canRemind(r.status) ? (
          <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="icon-btn"
              disabled={remind.isPending}
              title={remindedId === r.id && remind.isSuccess ? 'Reminder sent' : 'Send reminder'}
              aria-label={remindedId === r.id && remind.isSuccess ? 'Reminder sent' : 'Send reminder'}
              onClick={(e) => sendReminder(e, r.id)}
            >
              <Icon name={remindedId === r.id && remind.isSuccess ? 'check' : 'bell'} />
            </button>
          </span>
        ) : null,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader title="Registrations" subtitle="Review school sign-ups. Approving provisions the tenant, signs a license, and creates the first admin." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <StatCard label="Total" tone="violet" icon="note" value={analytics.isLoading ? <Spinner /> : (a?.total ?? 0)} />
        <StatCard label="Pending" tone="warning" icon="user-plus" value={analytics.isLoading ? <Spinner /> : (a?.pending ?? 0)} />
        <StatCard
          label="Avg Approval Time"
          tone="info"
          icon="chart"
          value={analytics.isLoading ? <Spinner /> : a ? `${a.avg_approval_hours}h` : '—'}
        />
        <StatCard
          label="Approval Rate"
          tone="success"
          icon="shield"
          value={analytics.isLoading ? <Spinner /> : a ? `${a.approval_rate_pct}%` : '—'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <SectionCard icon="chart" title="Request Volume / Day" tone="info">
          <DotChart data={a?.volume_per_day ?? []} />
        </SectionCard>
        <SectionCard icon="layers" title="Registrations by Status" tone="violet">
          <BarSeries
            data={[
              { label: 'Pending', value: (a?.pending ?? 0) - (a?.under_review ?? 0) },
              { label: 'Under Review', value: a?.under_review ?? 0 },
              { label: 'Approved', value: a?.approved ?? 0 },
              { label: 'Rejected', value: a?.rejected ?? 0 },
            ]}
            tone="#7c4dff"
          />
        </SectionCard>
      </div>

      {remind.error && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }}>Failed to send reminder: {String(remind.error)}</p>
      )}

      <SectionCard
        icon="user-plus"
        title="Registration Queue"
        tone="primary"
        right={<Tabs tabs={FILTER_TABS} active={filter} onChange={setFilter} />}
      >
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          loading={isLoading}
          searchable
          searchText={(r) => `${r.school_name} ${r.slug} ${r.admin_name} ${r.admin_email} ${r.status} ${r.kyc_status ?? ''} ${r.risk_score ?? ''} ${r.source ?? ''}`}
          empty="No registrations match this filter."
          onRowClick={(r) => navigate(`/registrations/${r.id}`)}
        />
      </SectionCard>
    </div>
  );
}
