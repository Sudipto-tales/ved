// The payment-review queue — pending payment proofs awaiting a superadmin decision.
// Each proof links to its detail page where it can be approved (provisioning the tenant)
// or rejected. Backed by GET /api/v1/platform/payment-proofs.
import { useNavigate } from 'react-router-dom';
import { Badge, Card, DataTable, EmptyState, Icon, PageHeader } from '@/shared/ui';
import { usePaymentProofs, type PaymentProof } from '../registrations/api';

export default function PaymentProofsPage() {
  const { data, isLoading, error } = usePaymentProofs();
  const navigate = useNavigate();
  const rows = data?.payment_proofs ?? [];

  return (
    <div style={{ maxWidth: 920 }}>
      <PageHeader title="Payment Proofs" subtitle="Pending payment submissions awaiting verification. Approve to provision the school, or reject with a reason." />
      {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
      <Card className="mt-16">
        <DataTable<PaymentProof>
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.id}
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
      </Card>
    </div>
  );
}
