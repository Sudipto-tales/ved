// Programs (M5 academics) — the top of the academic structure (program → stage →
// section). List + create. Ordinary mutable config.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, StatCard } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useCreateProgram, usePrograms, type Program } from '../api/academicsApi';

export default function ProgramsPage() {
  const nav = useNavigate();
  const { data, isLoading, error } = usePrograms();
  const create = useCreateProgram();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const rows = data?.programs ?? [];

  return (
    <div>
      <PageHeader title="Programs" subtitle="The top of the academic structure: a course of study (program → stage → section)." />

      <div className="grid-stats">
        <StatCard label="Programs" value={rows.length} accent />
        <StatCard label="Isolation" value={<Badge tone="success">RLS on</Badge>} />
      </div>

      <Can permission="academics.manage">
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>New program</h3>
          {create.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(create.error)}</p>}
          <div className="flex gap-12">
            <Field label="Name"><input className="input" placeholder="e.g. Senior Secondary" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Code"><input className="input" placeholder="e.g. SS" value={code} onChange={(e) => setCode(e.target.value)} style={{ maxWidth: 160 }} /></Field>
            <div style={{ alignSelf: 'flex-end' }}>
              <Button
                disabled={!name.trim() || !code.trim() || create.isPending}
                onClick={() => create.mutate({ name: name.trim(), code: code.trim() }, { onSuccess: () => { setName(''); setCode(''); } })}
              >
                Create
              </Button>
            </div>
          </div>
        </Card>
      </Can>

      <Card className="mt-16">
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<Program>
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => nav(`/programs/${r.id}`)}
          searchable
          searchText={(r) => `${r.name} ${r.code}`}
          empty={<EmptyState icon={<Icon name="graduation" />} title="No programs yet" desc="Create the first program to start building your academic structure." />}
          columns={[
            { header: 'Name', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { header: 'Code', cell: (r) => <span className="subtle">{r.code}</span> },
            { header: 'Mode', cell: (r) => <Badge tone="info">{r.enrollment_mode}</Badge> },
            { header: 'Status', cell: (r) => <Badge tone={r.status === 'ACTIVE' ? 'success' : 'neutral'}>{r.status}</Badge> },
            {
              header: '',
              align: 'right',
              cell: (r) => (
                <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="icon-btn" title="View" aria-label="View" onClick={(e) => { e.stopPropagation(); nav(`/programs/${r.id}`); }}><Icon name="eye" /></button>
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
