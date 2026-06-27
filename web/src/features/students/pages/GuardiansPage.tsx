// Guardian directory (record management) — the tenant's guardian contacts with a live
// child count, RLS-scoped server-side. Staff can promote a contact-only guardian to a
// portal user; the generated credentials are shown ONCE (docs/18). Read-only otherwise.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon,
  PageHeader,
  StatCard,
  type Column,
} from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import {
  useGuardians,
  usePromoteGuardian,
  type GuardianRow,
  type PromoteResult,
} from '../api/studentsApi';

export default function GuardiansPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useGuardians();
  const promote = usePromoteGuardian();

  const [promoted, setPromoted] = useState<{ name: string; creds: PromoteResult } | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const guardians = data?.guardians ?? [];
  const total = guardians.length;
  const linked = guardians.reduce((n, g) => n + g.child_count, 0);

  function doPromote(g: GuardianRow) {
    setPromotingId(g.id);
    promote.mutate(g.id, {
      onSuccess: (creds) => setPromoted({ name: g.name, creds }),
      onSettled: () => setPromotingId(null),
    });
  }

  const columns: Column<GuardianRow>[] = [
    {
      header: 'Name',
      cell: (g) => (
        <div>
          <span style={{ fontWeight: 600 }}>{g.name}</span>
          {g.email && <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>{g.email}</span>}
        </div>
      ),
    },
    { header: 'Phone', cell: (g) => <span className="subtle">{g.phone}</span> },
    {
      header: 'Relation',
      cell: (g) => (g.relation_default ? <Badge tone="neutral">{g.relation_default}</Badge> : <span className="muted">—</span>),
    },
    {
      header: 'Children',
      align: 'right',
      cell: (g) => <span style={{ fontWeight: 600 }}>{g.child_count}</span>,
    },
    {
      header: '',
      align: 'right',
      cell: (g) => (
        <Can permission="student.update">
          <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="icon-btn"
              title={promotingId === g.id ? 'Promoting…' : 'Promote to portal'}
              aria-label="Promote to portal"
              disabled={promote.isPending}
              onClick={(e) => {
                e.stopPropagation();
                doPromote(g);
              }}
            >
              <Icon name="user-plus" />
            </button>
          </span>
        </Can>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 920 }}>
      <PageHeader
        title="Guardians"
        subtitle="Guardian contact records for this school. Promote a guardian to give them portal access — the login is created with the Guardian role in one transaction."
      />

      <div className="grid-stats">
        <StatCard label="Guardians" value={total} accent />
        <StatCard label="Guardian–student links" value={linked} />
        <StatCard label="Isolation" value={<Badge tone="success">RLS on</Badge>} />
      </div>

      {/* One-time credentials surfaced after a promotion. */}
      {promoted && (
        <Card className="mt-16" style={{ borderColor: 'var(--success)' }}>
          <div className="flex gap-8" style={{ alignItems: 'center', marginBottom: 12 }}>
            <Icon name="shield" />
            <h3 style={{ fontSize: 15, margin: 0 }}>Portal access created for {promoted.name}</h3>
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Hand these to the guardian. The password is shown only once and must be reset on first login.
          </p>
          <div className="row"><span className="muted">Login</span><code>{promoted.creds.login_identifier}</code></div>
          <div className="row"><span className="muted">Temporary password</span><code>{promoted.creds.temp_password}</code></div>
          <div className="mt-16">
            <Button variant="ghost" onClick={() => setPromoted(null)}>Dismiss</Button>
          </div>
        </Card>
      )}

      {promote.error && !promoted && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }} className="mt-16">{String(promote.error)}</p>
      )}

      <Card className="mt-16">
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<GuardianRow>
          columns={columns}
          rows={guardians}
          rowKey={(g) => g.id}
          loading={isLoading}
          searchable
          searchText={(g) => `${g.name} ${g.phone} ${g.email ?? ''} ${g.relation_default}`}
          onRowClick={(g) => navigate(`/guardians/${g.id}`)}
          empty={
            <EmptyState
              icon={<Icon name="users" size={28} />}
              title="No guardians yet"
              desc="Guardians are created when you onboard a student with a guardian, or imported in bulk."
            />
          }
        />
      </Card>
    </div>
  );
}
