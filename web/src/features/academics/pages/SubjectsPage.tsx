// Subjects (M5) — the catalogue of taught subjects, reused across stages via curriculum.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, Select, StatCard } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useCreateSubject, useSubjects, type Subject } from '../api/academicsApi';

const KINDS = ['THEORY', 'LAB', 'OTHER'];

export default function SubjectsPage() {
  const nav = useNavigate();
  const { data, isLoading, error } = useSubjects();
  const create = useCreateSubject();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [kind, setKind] = useState('THEORY');
  const rows = data?.subjects ?? [];

  return (
    <div>
      <PageHeader title="Subjects" subtitle="The taught-subject catalogue, mapped to stages via curriculum." />

      <div className="grid-stats">
        <StatCard label="Subjects" value={rows.length} accent />
      </div>

      <Can permission="academics.manage">
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>New subject</h3>
          {create.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(create.error)}</p>}
          <div className="flex gap-12">
            <Field label="Name"><input className="input" placeholder="e.g. Physics" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Code"><input className="input" placeholder="e.g. PHY" value={code} onChange={(e) => setCode(e.target.value)} style={{ maxWidth: 140 }} /></Field>
            <Field label="Kind">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </Field>
            <div style={{ alignSelf: 'flex-end' }}>
              <Button
                disabled={!name.trim() || !code.trim() || create.isPending}
                onClick={() => create.mutate({ name: name.trim(), code: code.trim(), kind }, { onSuccess: () => { setName(''); setCode(''); } })}
              >
                Create
              </Button>
            </div>
          </div>
        </Card>
      </Can>

      <Card className="mt-16">
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<Subject>
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => nav(`/subjects/${r.id}`)}
          searchable
          searchText={(r) => `${r.name} ${r.code}`}
          empty={<EmptyState icon={<Icon name="book" />} title="No subjects yet" desc="Add the first subject to your catalogue." />}
          columns={[
            { header: 'Name', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { header: 'Code', cell: (r) => <span className="subtle">{r.code}</span> },
            { header: 'Kind', cell: (r) => <Badge tone="info">{r.kind}</Badge> },
            {
              header: '',
              align: 'right',
              cell: (r) => (
                <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="icon-btn" title="View" aria-label="View" onClick={(e) => { e.stopPropagation(); nav(`/subjects/${r.id}`); }}><Icon name="eye" /></button>
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
