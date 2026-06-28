// Sections (M5) — a teachable group within a stage for the current academic year.
// Create needs a stage (picked via program → stage dependent dropdowns).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, Select, StatCard } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { SetupGate } from '@/features/dashboard/setup/SetupGate';
import { useAllStages, useCreateSection, usePrograms, useSections, type Section } from '../api/academicsApi';

export default function SectionsPage() {
  const nav = useNavigate();
  const { data, isLoading, error } = useSections();
  const { data: programs } = usePrograms();
  const { data: stages } = useAllStages();
  const create = useCreateSection();

  const [programId, setProgramId] = useState('');
  const [stageId, setStageId] = useState('');
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');

  const stageOptions = (stages?.stages ?? []).filter((s) => !programId || s.program_id === programId);
  const rows = data?.sections ?? [];

  return (
    <div>
      <PageHeader title="Sections" subtitle="A teachable group within a stage for the current academic year." />

      <SetupGate step="sections" />

      <div className="grid-stats">
        <StatCard label="Sections" value={rows.length} accent />
      </div>

      <Can permission="academics.manage">
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>New section</h3>
          {create.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(create.error)}</p>}
          <div className="flex gap-12">
            <Field label="Program">
              <Select value={programId} onChange={(e) => { setProgramId(e.target.value); setStageId(''); }}>
                <option value="">All</option>
                {(programs?.programs ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Stage">
              <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
                <option value="">Select…</option>
                {stageOptions.map((s) => <option key={s.id} value={s.id}>{s.program_name} — {s.name}</option>)}
              </Select>
            </Field>
            <Field label="Name"><input className="input" placeholder="e.g. A" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 120 }} /></Field>
            <Field label="Capacity" hint="optional"><input className="input" type="number" placeholder="40" value={capacity} onChange={(e) => setCapacity(e.target.value)} style={{ maxWidth: 110 }} /></Field>
            <div style={{ alignSelf: 'flex-end' }}>
              <Button
                disabled={!stageId || !name.trim() || create.isPending}
                onClick={() => create.mutate(
                  { program_stage_id: stageId, name: name.trim(), capacity: capacity ? Number(capacity) : undefined },
                  { onSuccess: () => { setName(''); setCapacity(''); } },
                )}
              >
                Create
              </Button>
            </div>
          </div>
        </Card>
      </Can>

      <Card className="mt-16">
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<Section>
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => nav(`/sections/${r.id}`)}
          searchable
          searchText={(r) => `${r.name} ${r.stage_name} ${r.program_name}`}
          empty={<EmptyState icon={<Icon name="grid" />} title="No sections yet" desc="Create a section to start enrolling students." />}
          columns={[
            { header: 'Program', cell: (r) => <span className="subtle">{r.program_name}</span> },
            { header: 'Stage', cell: (r) => r.stage_name },
            { header: 'Section', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { header: 'Capacity', cell: (r) => r.capacity ?? '—', align: 'right', width: 100 },
            {
              header: '',
              align: 'right',
              cell: (r) => (
                <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="icon-btn" title="View" aria-label="View" onClick={(e) => { e.stopPropagation(); nav(`/sections/${r.id}`); }}><Icon name="eye" /></button>
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
