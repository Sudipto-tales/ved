// Issued signed licenses — the offline enforcement tokens delivered to nodes.
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, PageHeader, Spinner } from '@/shared/ui';
import { api } from '../../shared/api';

interface License {
  id: string;
  tenant_slug: string;
  plan: string;
  seats: number;
  issued_at: string;
  expires_at: string;
  revoked: boolean;
}

export default function LicensesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['platform', 'licenses'],
    queryFn: () => api.get<{ licenses: License[] }>('/api/v1/platform/licenses'),
  });

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="Licenses" subtitle="Signed, offline-validatable enforcement tokens issued to nodes on approval." />
      <Card className="mt-16">
        {isLoading && <Spinner />}
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        {!isLoading && (data?.licenses.length ?? 0) === 0 && <p className="muted">No licenses issued yet.</p>}
        {data?.licenses.map((l) => (
          <div className="row" key={l.id}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600 }}>/{l.tenant_slug}</span>
              <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>{l.plan} · {l.seats} seats</span>
            </div>
            <span className="subtle" style={{ fontSize: 12 }}>exp {new Date(l.expires_at).toLocaleDateString()}</span>
            <Badge tone={l.revoked ? 'warning' : 'success'}>{l.revoked ? 'revoked' : 'active'}</Badge>
          </div>
        ))}
      </Card>
    </div>
  );
}
