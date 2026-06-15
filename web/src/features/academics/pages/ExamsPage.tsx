// Exams (M5) — assessment events for the current academic year. List + create.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, StatCard } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useCreateExam, useExams, type Exam } from '../api/academicsApi';

export default function ExamsPage() {
  const nav = useNavigate();
  const { data, isLoading, error } = useExams();
  const create = useCreateExam();
  const [name, setName] = useState('');
  const [maxMarks, setMaxMarks] = useState('100');
  const rows = data?.exams ?? [];

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="Exams" subtitle="Assessment events for the current academic year — marks are entered against these." />

      <div className="grid-stats">
        <StatCard label="Exams" value={rows.length} accent />
      </div>

      <Can permission="academics.manage">
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>New exam</h3>
          {create.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(create.error)}</p>}
          <div className="flex gap-12">
            <Field label="Name"><input className="input" placeholder="e.g. Mid-Term 2026" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Max marks"><input className="input" type="number" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} style={{ maxWidth: 120 }} /></Field>
            <div style={{ alignSelf: 'flex-end' }}>
              <Button
                disabled={!name.trim() || !Number(maxMarks) || create.isPending}
                onClick={() => create.mutate({ name: name.trim(), max_marks: Number(maxMarks) }, { onSuccess: () => setName('') })}
              >
                Create
              </Button>
            </div>
          </div>
        </Card>
      </Can>

      <Card className="mt-16">
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<Exam>
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => nav(`/exams/${r.id}`)}
          empty={<EmptyState icon={<Icon name="chart" />} title="No exams yet" desc="Create an exam to start entering marks." />}
          columns={[
            { header: 'Name', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { header: 'Max marks', cell: (r) => r.max_marks, align: 'right', width: 120 },
          ]}
        />
      </Card>
    </div>
  );
}
