// Program stages — a flat list of every stage across all programs.
import { useNavigate } from 'react-router-dom';
import { Card, DataTable, EmptyState, Icon, PageHeader, StatCard } from '@/shared/ui';
import { useAllStages, type AllStage } from '../api/academicsApi';

export default function ProgramStagesPage() {
  const nav = useNavigate();
  const { data, isLoading, error } = useAllStages();
  const rows = data?.stages ?? [];

  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader title="Program stages" subtitle="Every stage across all programs — the levels sections and curriculum hang off." />

      <div className="grid-stats">
        <StatCard label="Stages" value={rows.length} accent />
      </div>

      <Card className="mt-16">
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<AllStage>
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => nav(`/program-stages/${r.id}`)}
          empty={<EmptyState icon={<Icon name="layers" />} title="No stages yet" desc="Add stages from a program's detail page." />}
          columns={[
            { header: 'Program', cell: (r) => <span className="subtle">{r.program_name}</span> },
            { header: 'Stage', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { header: 'Ordinal', cell: (r) => r.ordinal, align: 'right', width: 90 },
          ]}
        />
      </Card>
    </div>
  );
}
