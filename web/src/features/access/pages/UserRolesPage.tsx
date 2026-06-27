// Assign Roles to Users (M2 RBAC). Each member's role set is a multi-select; saving
// replaces their membership_roles via PUT /access/members/:id/roles. Effective
// permissions are the union across the assigned roles (tenant.admin = all).
import { useEffect, useState } from 'react';
import { Badge, Button, Card, PageHeader, Spinner } from '@/shared/ui';
import { useMembers, useRoles, useSetMemberRoles, type Member } from '../api/accessApi';

function RoleEditor({
  member,
  roles,
}: {
  member: Member;
  roles: { id: string; name: string; is_system: boolean }[];
}) {
  const setRoles = useSetMemberRoles();
  const [selected, setSelected] = useState<Set<string>>(new Set(member.role_ids));
  useEffect(() => setSelected(new Set(member.role_ids)), [member.role_ids]);

  const dirty =
    selected.size !== member.role_ids.length ||
    [...selected].some((id) => !member.role_ids.includes(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <div className="flex gap-8" style={{ alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>{member.login_identifier}</span>
          <Badge tone="neutral">{member.user_type}</Badge>
          <Badge tone={member.status === 'ACTIVE' ? 'success' : 'neutral'}>{member.status}</Badge>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {roles.map((r) => (
            <label
              key={r.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                padding: '4px 10px',
                borderRadius: 8,
                background: selected.has(r.id) ? 'var(--accent-tint, #eef2ff)' : 'var(--surface-2, #f6f7f9)',
                cursor: 'pointer',
              }}
            >
              <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
              {r.name}
            </label>
          ))}
        </div>
        {setRoles.error && (
          <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(setRoles.error)}</p>
        )}
      </div>
      <Button
        disabled={!dirty || setRoles.isPending}
        onClick={() =>
          setRoles.mutate({ membershipId: member.membership_id, roleIds: [...selected] })
        }
      >
        Save
      </Button>
    </div>
  );
}

export default function UserRolesPage() {
  const members = useMembers();
  const roles = useRoles();

  return (
    <div>
      <PageHeader
        title="Assign Roles to Users"
        subtitle="A member may hold several roles; effective permissions are the union across them."
      />

      <Card className="mt-16">
        {(members.isLoading || roles.isLoading) && <Spinner />}
        {members.error && <p style={{ color: 'var(--danger)' }}>Failed to load members.</p>}
        {members.data?.members.length === 0 && <p className="muted">No members yet.</p>}
        {members.data?.members.map((m) => (
          <RoleEditor key={m.membership_id} member={m} roles={roles.data?.roles ?? []} />
        ))}
      </Card>
    </div>
  );
}
