// Designations (M2 RBAC). A designation is a job-title label that can be scoped to a
// user type (TEACHER/EMPLOYEE/…). WIRED to the live access service: list via GET, create
// via POST, both gated designation.manage on the server.
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  PageHeader,
  Select,
  Toolbar,
  type Column,
} from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useDesignations, useCreateDesignation, type Designation } from '../api/accessApi';

const USER_TYPES = ['', 'TEACHER', 'EMPLOYEE', 'STUDENT', 'GUARDIAN'];

export default function DesignationsPage() {
  const list = useDesignations();
  const create = useCreateDesignation();

  const [name, setName] = useState('');
  const [appliesTo, setAppliesTo] = useState('');

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, applies_to_user_type: appliesTo || null },
      {
        onSuccess: () => {
          setName('');
          setAppliesTo('');
        },
      },
    );
  }

  const columns: Column<Designation>[] = [
    { header: 'Designation', cell: (d) => <span style={{ fontWeight: 600 }}>{d.name}</span> },
    {
      header: 'Applies to',
      cell: (d) =>
        d.applies_to_user_type ? (
          <Badge tone="info">{d.applies_to_user_type}</Badge>
        ) : (
          <span className="subtle">Any user type</span>
        ),
    },
  ];

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader
        title="Designations"
        subtitle="Job-title labels assignable to members. Optionally scope a designation to one user type."
      />

      <Can permission="designation.manage">
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>New designation</h3>
          <Toolbar>
            <Field label="Name">
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Head of Department"
                style={{ minWidth: 260 }}
              />
            </Field>
            <Field label="Applies to" hint="Leave blank to allow any user type">
              <Select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)}>
                {USER_TYPES.map((t) => (
                  <option key={t || 'any'} value={t}>
                    {t || 'Any user type'}
                  </option>
                ))}
              </Select>
            </Field>
          </Toolbar>
          {create.error && (
            <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(create.error)}</p>
          )}
          <div className="mt-16">
            <Button disabled={!name.trim() || create.isPending} onClick={submit}>
              {create.isPending ? 'Adding…' : 'Add designation'}
            </Button>
          </div>
        </Card>
      </Can>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Designations</h3>
        <DataTable
          columns={columns}
          rows={list.data?.designations ?? []}
          rowKey={(d) => d.id}
          loading={list.isLoading}
          searchable
          searchText={(d) => d.name}
          empty={list.error ? 'Failed to load designations.' : 'No designations yet.'}
        />
      </Card>
    </div>
  );
}
