// Control-plane dashboard — at-a-glance counts across the platform.
import { useQuery } from '@tanstack/react-query';
import { Badge, PageHeader, Spinner, StatCard } from '@/shared/ui';
import { api } from '../../shared/api';

export default function DashboardPage() {
  const regs = useQuery({
    queryKey: ['platform', 'registrations'],
    queryFn: () => api.get<{ registrations: { status: string }[] }>('/api/v1/platform/registrations'),
  });
  const tenants = useQuery({
    queryKey: ['platform', 'tenants'],
    queryFn: () => api.get<{ tenants: unknown[] }>('/api/v1/platform/tenants'),
  });
  const licenses = useQuery({
    queryKey: ['platform', 'licenses'],
    queryFn: () => api.get<{ licenses: { revoked: boolean }[] }>('/api/v1/platform/licenses'),
  });

  const pending = regs.data?.registrations.filter((r) => r.status === 'PENDING_PAYMENT_REVIEW').length ?? 0;
  const loading = regs.isLoading || tenants.isLoading || licenses.isLoading;

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="Dashboard" subtitle="The VED platform at a glance." />
      {loading ? (
        <Spinner />
      ) : (
        <div className="grid-stats mt-16">
          <StatCard label="Pending review" value={pending} accent />
          <StatCard label="Registrations" value={regs.data?.registrations.length ?? 0} />
          <StatCard label="Tenants" value={tenants.data?.tenants.length ?? 0} />
          <StatCard label="Licenses" value={<Badge tone="success">{licenses.data?.licenses.length ?? 0} issued</Badge>} />
        </div>
      )}
    </div>
  );
}
