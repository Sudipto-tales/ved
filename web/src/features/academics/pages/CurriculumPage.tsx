// Curriculum — pick a stage, see the subjects mapped to it (mandatory vs elective).
import { useState } from 'react';
import { Badge, Card, DataTable, EmptyState, Field, Icon, PageHeader, Select } from '@/shared/ui';
import { useAllStages, useCurriculum, type CurriculumItem } from '../api/academicsApi';

export default function CurriculumPage() {
  const { data: stages } = useAllStages();
  const [stageId, setStageId] = useState('');
  const { data, isLoading, error } = useCurriculum(stageId);
  const rows = data?.curriculum ?? [];

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="Curriculum" subtitle="Which subjects a stage teaches — the bridge between stages and subjects." />

      <Card className="mt-16">
        <Field label="Stage">
          <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
            <option value="">Select a stage…</option>
            {(stages?.stages ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.program_name} — {s.name}</option>
            ))}
          </Select>
        </Field>
      </Card>

      {stageId && (
        <Card className="mt-16">
          {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
          <DataTable<CurriculumItem>
            loading={isLoading}
            rows={rows}
            rowKey={(r) => r.id}
            empty={<EmptyState icon={<Icon name="book" />} title="No subjects mapped" desc="This stage has no curriculum entries yet." />}
            columns={[
              { header: 'Subject', cell: (r) => <span style={{ fontWeight: 600 }}>{r.subject_name}</span> },
              { header: 'Code', cell: (r) => <span className="subtle">{r.subject_code}</span> },
              { header: 'Requirement', cell: (r) => <Badge tone={r.requirement === 'MANDATORY' ? 'primary' : 'neutral'}>{r.requirement}</Badge> },
            ]}
          />
        </Card>
      )}

      {!stageId && (
        <Card className="mt-16"><EmptyState icon={<Icon name="layers" />} title="Pick a stage" desc="Select a stage above to view its curriculum." /></Card>
      )}
    </div>
  );
}
