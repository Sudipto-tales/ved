// Exports (DESIGNED SCAFFOLD, no backend). A catalogue of data exports with format choice.
// Buttons are inert until the reports export pipeline ships.
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  Icon,
  PageHeader,
  Select,
  type Column,
} from '@/shared/ui';

interface ExportDef {
  id: string;
  name: string;
  scope: string;
  rows: string;
}

const EXPORTS: ExportDef[] = [
  { id: 'e1', name: 'Student directory', scope: 'students', rows: '~1,296 rows' },
  { id: 'e2', name: 'Staff & teachers', scope: 'people', rows: '~140 rows' },
  { id: 'e3', name: 'Fee ledger', scope: 'finance', rows: '~9,400 rows' },
  { id: 'e4', name: 'Attendance register', scope: 'academics', rows: '~240k rows' },
  { id: 'e5', name: 'Exam marks', scope: 'academics', rows: '~58k rows' },
];

const FORMATS = ['CSV', 'XLSX', 'PDF'];

export default function ExportsPage() {
  const [format, setFormat] = useState('CSV');

  const columns: Column<ExportDef>[] = [
    { header: 'Dataset', cell: (e) => <span style={{ fontWeight: 600 }}>{e.name}</span> },
    { header: 'Scope', cell: (e) => <Badge tone="neutral">{e.scope}</Badge> },
    { header: 'Size', cell: (e) => <span className="subtle">{e.rows}</span> },
    {
      header: '',
      align: 'right',
      cell: () => (
        <Button variant="secondary" disabled>
          Export {format}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader
        title="Exports"
        subtitle="Download institution data for reporting or migration. Preview only — the export pipeline is not yet wired."
      />

      <Card className="mt-16">
        <div className="flex gap-8" style={{ alignItems: 'center' }}>
          <Icon name="chart" />
          <Field label="Default format">
            <Select value={format} onChange={(e) => setFormat(e.target.value)}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Available exports</h3>
        <DataTable columns={columns} rows={EXPORTS} rowKey={(e) => e.id} />
      </Card>
    </div>
  );
}
