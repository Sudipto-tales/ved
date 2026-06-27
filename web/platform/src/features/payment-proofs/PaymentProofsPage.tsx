// The payment-review queue — pending payment proofs awaiting a superadmin decision.
// Each proof links to its detail page where it can be approved (provisioning the tenant)
// or rejected. Backed by GET /api/v1/platform/payment-proofs.
import { useNavigate } from 'react-router-dom';
import { Badge, DataTable, EmptyState, Icon, PageHeader, SectionCard, StatCard } from '@/shared/ui';
import { usePaymentAnalytics } from '../../shared/platformApi';
import { usePaymentProofs, type PaymentProof } from '../registrations/api';

export default function PaymentProofsPage() {
  const { data, isLoading, error } = usePaymentProofs();
  const analytics = usePaymentAnalytics();
  const navigate = useNavigate();
  const rows = data?.payment_proofs ?? [];
  const a = analytics.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader title="Payment Proofs" subtitle="Pending payment submissions awaiting verification. Approve to provision the school, or reject with a reason." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <StatCard label="Pending Payments" tone="warning" icon="wallet" value={analytics.isLoading ? '…' : (a?.pending ?? 0)} />
        <StatCard label="Approval Rate" tone="success" icon="shield" value={analytics.isLoading ? '…' : `${a?.approval_rate_pct ?? 0}%`} />
        <StatCard label="Avg Verification Time" tone="info" icon="chart" value={analytics.isLoading ? '…' : `${a?.avg_verification_hours ?? 0}h`} />
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
      <SectionCard icon="wallet" title="Payment Review Queue" tone="warning">
        <DataTable<PaymentProof>
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.id}
          searchable
          searchText={(r) => `${r.school_name} ${r.slug} ${r.txn_id} ${r.method} ${r.payer_name ?? ''} ${r.status}`}
          onRowClick={(r) => navigate(`/payment-proofs/${r.id}`)}
          empty={<EmptyState icon={<Icon name="wallet" />} title="Queue is clear" desc="No payment proofs are awaiting review." />}
          columns={[
            { header: 'School', cell: (r) => (<><span style={{ fontWeight: 600 }}>{r.school_name}</span><span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>/{r.slug}</span></>) },
            { header: 'Amount', align: 'right', cell: (r) => `${r.currency} ${r.amount.toLocaleString()}` },
            { header: 'Method', cell: (r) => r.method },
            { header: 'Txn', cell: (r) => <code>{r.txn_id}</code> },
            { header: 'Submitted', cell: (r) => new Date(r.created_at).toLocaleDateString() },
            { header: 'Status', align: 'right', cell: (r) => <Badge tone="warning">{r.status}</Badge> },
          ]}
        />
      </SectionCard>
    </div>
  );
}
