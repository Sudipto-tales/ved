// Program detail — its stages (ordered by ordinal) + add a stage.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useCreateStage, usePrograms, useStages, type Stage } from '../api/academicsApi';

export default function ProgramDetailPage() {
  const { id = '' } = useParams();
  const { data: programs } = usePrograms();
  const program = programs?.programs.find((p) => p.id === id);
  const { data, isLoading, error } = useStages(id);
  const create = useCreateStage(id);
  const [name, setName] = useState('');
  const [ordinal, setOrdinal] = useState('');
  const rows = data?.stages ?? [];

  return (
    <div>
      <PageHeader title={program ? program.name : 'Program'} subtitle="Stages divide a program into ordered levels (grades / years / semesters)." />
      <Link to="/programs" className="subtle" style={{ fontSize: 13 }}>← Back to programs</Link>

      {program && (
        <div className="row mt-16">
          <Badge tone="info">{program.code}</Badge>
          <span className="subtle" style={{ marginLeft: 8 }}>{program.enrollment_mode}</span>
        </div>
      )}

      <Can permission="academics.manage">
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Add stage</h3>
          {create.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(create.error)}</p>}
          <div className="flex gap-12">
            <Field label="Name"><input className="input" placeholder="e.g. Grade 11" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Ordinal" hint="ordering"><input className="input" type="number" placeholder="1" value={ordinal} onChange={(e) => setOrdinal(e.target.value)} style={{ maxWidth: 110 }} /></Field>
            <div style={{ alignSelf: 'flex-end' }}>
              <Button
                disabled={!name.trim() || !ordinal || create.isPending}
                onClick={() => create.mutate({ name: name.trim(), ordinal: Number(ordinal) }, { onSuccess: () => { setName(''); setOrdinal(''); } })}
              >
                Add
              </Button>
            </div>
          </div>
        </Card>
      </Can>

      <Card className="mt-16">
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<Stage>
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={<Icon name="layers" />} title="No stages yet" desc="Add the program's first stage." />}
          columns={[
            { header: '#', cell: (r) => <span className="subtle">{r.ordinal}</span>, width: 60 },
            { header: 'Stage', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
          ]}
        />
      </Card>
    </div>
  );
}
