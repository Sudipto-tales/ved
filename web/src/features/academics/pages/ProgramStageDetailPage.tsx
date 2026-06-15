// Program stage detail — the stage with its curriculum (subjects) and sections.
import { Link, useParams } from 'react-router-dom';
import { Badge, Card, DataTable, EmptyState, Icon, PageHeader, Spinner } from '@/shared/ui';
import { useAllStages, useCurriculum, useSections, type CurriculumItem, type Section } from '../api/academicsApi';

export default function ProgramStageDetailPage() {
  const { id = '' } = useParams();
  const { data: stages, isLoading: stagesLoading } = useAllStages();
  const stage = stages?.stages.find((s) => s.id === id);
  const { data: curriculum, isLoading: curLoading } = useCurriculum(id);
  const { data: sectionsData, isLoading: secLoading } = useSections();
  const sections = (sectionsData?.sections ?? []).filter((s) => s.program_stage_id === id);

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title={stage ? stage.name : 'Stage'} subtitle="The subjects in this stage's curriculum and the sections that run it." />
      <Link to="/program-stages" className="subtle" style={{ fontSize: 13 }}>← Back to stages</Link>

      {stagesLoading && <div className="mt-16"><Spinner /></div>}
      {stage && (
        <div className="row mt-16">
          <span className="subtle">{stage.program_name}</span>
          <Badge tone="info">ordinal {stage.ordinal}</Badge>
        </div>
      )}

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Curriculum</h3>
        <DataTable<CurriculumItem>
          loading={curLoading}
          rows={curriculum?.curriculum ?? []}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={<Icon name="book" />} title="No subjects mapped" desc="Map subjects to this stage from the Curriculum page." />}
          columns={[
            { header: 'Subject', cell: (r) => <span style={{ fontWeight: 600 }}>{r.subject_name}</span> },
            { header: 'Code', cell: (r) => <span className="subtle">{r.subject_code}</span> },
            { header: 'Requirement', cell: (r) => <Badge tone={r.requirement === 'MANDATORY' ? 'primary' : 'neutral'}>{r.requirement}</Badge> },
          ]}
        />
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Sections</h3>
        <DataTable<Section>
          loading={secLoading}
          rows={sections}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={<Icon name="grid" />} title="No sections" desc="Create sections for this stage from the Sections page." />}
          columns={[
            { header: 'Section', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { header: 'Capacity', cell: (r) => r.capacity ?? '—', align: 'right', width: 100 },
          ]}
        />
      </Card>
    </div>
  );
}
