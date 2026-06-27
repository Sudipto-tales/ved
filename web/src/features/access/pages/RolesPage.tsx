// Roles & Permissions (M2 RBAC). Admins assemble dynamic roles from the fixed,
// code-defined permission catalog; the server enforces them via requirePermission.
// System roles (seeded at provisioning) are protected from edit/delete.
import { useMemo, useState } from 'react';
import { Badge, Button, Card, Icon, PageHeader, Spinner } from '@/shared/ui';
import {
  usePermissionCatalog,
  useRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  type Permission,
  type Role,
} from '../api/accessApi';

function groupByNamespace(perms: Permission[]): Record<string, Permission[]> {
  return perms.reduce<Record<string, Permission[]>>((acc, p) => {
    const ns = p.key.split('.')[0];
    (acc[ns] ??= []).push(p);
    return acc;
  }, {});
}

export default function RolesPage() {
  const catalog = usePermissionCatalog();
  const roles = useRoles();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const [editing, setEditing] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  function roleHaystack(r: Role): string {
    const summary = r.permissions.includes('tenant.admin')
      ? 'tenant.admin full control'
      : r.permissions.join(' ');
    return `${r.name} ${summary}`.toLowerCase();
  }

  const filteredRoles = (roles.data?.roles ?? []).filter((r) =>
    search.trim() ? roleHaystack(r).includes(search.trim().toLowerCase()) : true,
  );

  const groups = useMemo(() => groupByNamespace(catalog.data?.permissions ?? []), [catalog.data]);
  const busy = createRole.isPending || updateRole.isPending;

  function reset() {
    setEditing(null);
    setName('');
    setSelected(new Set());
  }

  function startEdit(role: Role) {
    setEditing(role);
    setName(role.name);
    setSelected(new Set(role.permissions));
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function submit() {
    const body = { name: name.trim(), permissions: [...selected] };
    if (!body.name) return;
    if (editing) {
      updateRole.mutate({ id: editing.id, ...body }, { onSuccess: reset });
    } else {
      createRole.mutate(body, { onSuccess: reset });
    }
  }

  const mutationError = createRole.error || updateRole.error || deleteRole.error;

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Roles are dynamic bundles of the fixed permission catalog. The server gate (requirePermission) is authoritative."
      />

      {mutationError && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(mutationError)}</p>
      )}

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>{editing ? `Edit role · ${editing.name}` : 'New role'}</h3>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Role name (e.g. Hostel Warden)"
          style={{ maxWidth: 360 }}
        />

        <div className="mt-16" style={{ display: 'grid', gap: 16 }}>
          {catalog.isLoading && <Spinner />}
          {Object.entries(groups).map(([ns, perms]) => (
            <div key={ns}>
              <div className="nav-group-label" style={{ marginBottom: 6 }}>{ns}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {perms.map((p) => (
                  <label
                    key={p.key}
                    title={p.description}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      padding: '4px 10px',
                      borderRadius: 8,
                      background: selected.has(p.key) ? 'var(--accent-tint, #eef2ff)' : 'var(--surface-2, #f6f7f9)',
                      cursor: 'pointer',
                    }}
                  >
                    <input type="checkbox" checked={selected.has(p.key)} onChange={() => toggle(p.key)} />
                    {p.key}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-8 mt-16">
          <Button disabled={!name.trim() || busy} onClick={submit}>
            {editing ? 'Save changes' : 'Create role'}
          </Button>
          {editing && (
            <Button onClick={reset} variant="ghost">
              Cancel
            </Button>
          )}
        </div>
      </Card>

      <Card className="mt-16">
        <div className="between" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 15 }}>Roles</h3>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search roles…"
            style={{ maxWidth: 220 }}
          />
        </div>
        {roles.isLoading && <Spinner />}
        {roles.error && <p style={{ color: 'var(--danger)' }}>Failed to load roles.</p>}
        {filteredRoles.map((r) => (
          <div className="row" key={r.id} style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div className="flex gap-8" style={{ alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{r.name}</span>
                {r.is_system && <Badge tone="neutral">system</Badge>}
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>
                {r.permissions.includes('tenant.admin')
                  ? 'tenant.admin — full control within this tenant'
                  : r.permissions.length === 0
                    ? 'no permissions'
                    : `${r.permissions.length} permission${r.permissions.length > 1 ? 's' : ''}: ${r.permissions.slice(0, 6).join(', ')}${r.permissions.length > 6 ? '…' : ''}`}
              </div>
            </div>
            {!r.is_system && (
              <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="icon-btn"
                  title="Edit"
                  aria-label="Edit"
                  onClick={(e) => { e.stopPropagation(); startEdit(r); }}
                >
                  <Icon name="edit" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Delete"
                  aria-label="Delete"
                  disabled={deleteRole.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete role "${r.name}"?`)) deleteRole.mutate(r.id);
                  }}
                >
                  <Icon name="trash" />
                </button>
              </span>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
