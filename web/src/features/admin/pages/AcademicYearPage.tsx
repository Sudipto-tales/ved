// Academic Year & Terms (tenant-setup). The year list is READ from the live academic_year
// rows (access slice GET). Creating a year + its terms is a designed scaffold — the form
// works and previews locally; persistence ships with the tenant-setup write slice.
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  PageHeader,
  type Column,
} from '@/shared/ui';
import { useAcademicYears, type AcademicYear } from '../api/adminApi';

interface DraftYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export default function AcademicYearPage() {
  const years = useAcademicYears();

  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [drafts, setDrafts] = useState<DraftYear[]>([]);

  function add() {
    if (!name.trim() || !start || !end) return;
    setDrafts((prev) => [
      ...prev,
      { id: `draft-${Date.now()}`, name: name.trim(), start_date: start, end_date: end, is_current: false },
    ]);
    setName('');
    setStart('');
    setEnd('');
  }

  // Show live rows; fall back to an illustrative sample if none are returned yet.
  const live = years.data?.academic_years ?? [];
  const sample: AcademicYear[] =
    live.length === 0 && !years.isLoading
      ? [{ id: 'sample', name: '2026-27', start_date: '2026-06-01', end_date: '2027-05-31', is_current: true }]
      : [];
  const rows: AcademicYear[] = [...live, ...sample, ...drafts];

  const columns: Column<AcademicYear>[] = [
    {
      header: 'Year',
      cell: (y) => (
        <span className="flex gap-8" style={{ alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>{y.name}</span>
          {y.is_current && <Badge tone="success">current</Badge>}
          {y.id.startsWith('draft-') && <Badge tone="warning">unsaved</Badge>}
        </span>
      ),
    },
    { header: 'Starts', cell: (y) => y.start_date },
    { header: 'Ends', cell: (y) => y.end_date },
  ];

  return (
    <div>
      <PageHeader
        title="Academic Year & Terms"
        subtitle="Define the academic calendar. Sections, exams, and fees anchor to the current year."
      />

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>New academic year</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Field label="Name" hint="e.g. 2027-28">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="2027-28" />
          </Field>
          <Field label="Start date">
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End date">
            <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <div className="mt-16">
          <Button disabled={!name.trim() || !start || !end} onClick={add}>
            Add year
          </Button>
        </div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Academic years</h3>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(y) => y.id}
          loading={years.isLoading}
          empty={years.error ? 'Failed to load academic years.' : 'No academic years yet.'}
        />
      </Card>
    </div>
  );
}
