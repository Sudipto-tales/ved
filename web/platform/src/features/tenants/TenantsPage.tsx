// The tenant directory — every school the platform has provisioned.
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, PageHeader, Spinner } from '@/shared/ui';
import { api } from '../../shared/api';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  provisioned_at?: string;
}

export default function TenantsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['platform', 'tenants'],
    queryFn: () => api.get<{ tenants: Tenant[] }>('/api/v1/platform/tenants'),
  });

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="Tenants" subtitle="Every provisioned school. A node binds to exactly one tenant by its immutable slug." />
      <Card className="mt-16">
        {isLoading && <Spinner />}
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        {!isLoading && (data?.tenants.length ?? 0) === 0 && <p className="muted">No tenants provisioned yet.</p>}
        {data?.tenants.map((t) => (
          <div className="row" key={t.id}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600 }}>{t.name}</span>
              <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>/{t.slug}</span>
            </div>
            <Badge tone={t.status === 'ACTIVE' ? 'success' : 'neutral'}>{t.status}</Badge>
          </div>
        ))}
      </Card>
    </div>
  );
}
