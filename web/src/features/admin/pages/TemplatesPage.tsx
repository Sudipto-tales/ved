// Document & Number Templates (tenant-setup — DESIGNED SCAFFOLD). Two concerns on one
// page: document templates (ID cards, certificates) and number-format sequences (admission
// no, receipt no). Tabs separate them; edits are local until the write slice lands.
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  PageHeader,
  Tabs,
  type Column,
} from '@/shared/ui';

type Tab = 'documents' | 'numbers';

interface DocTemplate {
  id: string;
  name: string;
  kind: string;
  updated: string;
}

interface NumberFormat {
  id: string;
  entity: string;
  format: string;
  next: string;
}

const DOCS: DocTemplate[] = [
  { id: 'd1', name: 'Student ID Card', kind: 'ID Card', updated: '2026-04-12' },
  { id: 'd2', name: 'Bonafide Certificate', kind: 'Certificate', updated: '2026-03-01' },
  { id: 'd3', name: 'Fee Receipt', kind: 'Receipt', updated: '2026-05-20' },
  { id: 'd4', name: 'Transfer Certificate', kind: 'Certificate', updated: '2026-02-10' },
];

const NUMBERS: NumberFormat[] = [
  { id: 'n1', entity: 'Admission No', format: 'ADM-{YYYY}-{#####}', next: 'ADM-2026-00042' },
  { id: 'n2', entity: 'Receipt No', format: 'RCT-{#####}', next: 'RCT-00128' },
  { id: 'n3', entity: 'Invoice No', format: 'INV-{YYYY}-{#####}', next: 'INV-2026-00091' },
];

export default function TemplatesPage() {
  const [tab, setTab] = useState<Tab>('documents');

  const docColumns: Column<DocTemplate>[] = [
    { header: 'Template', cell: (d) => <span style={{ fontWeight: 600 }}>{d.name}</span> },
    { header: 'Type', cell: (d) => <Badge tone="info">{d.kind}</Badge> },
    { header: 'Last updated', cell: (d) => <span className="subtle">{d.updated}</span> },
    {
      header: '',
      align: 'right',
      cell: () => (
        <Button variant="ghost" disabled>
          Edit
        </Button>
      ),
    },
  ];

  const numColumns: Column<NumberFormat>[] = [
    { header: 'Sequence', cell: (n) => <span style={{ fontWeight: 600 }}>{n.entity}</span> },
    { header: 'Format', cell: (n) => <code style={{ fontSize: 13 }}>{n.format}</code> },
    { header: 'Next value', cell: (n) => <Badge tone="neutral">{n.next}</Badge> },
  ];

  return (
    <div>
      <PageHeader
        title="Document & Number Templates"
        subtitle="Reusable document layouts and gapless number sequences. Preview only — editing is not yet wired."
      />

      <div className="mt-16">
        <Tabs<Tab>
          tabs={[
            { id: 'documents', label: 'Document templates' },
            { id: 'numbers', label: 'Number formats' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'documents' ? (
        <Card className="mt-16">
          <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15 }}>Document templates</h3>
            <Button variant="secondary" disabled>
              New template
            </Button>
          </div>
          <DataTable columns={docColumns} rows={DOCS} rowKey={(d) => d.id} />
        </Card>
      ) : (
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Number formats</h3>
          <DataTable columns={numColumns} rows={NUMBERS} rowKey={(n) => n.id} />
          <div className="mt-16">
            <Field label="Format tokens" hint="Use {YYYY} for year and {#####} for a zero-padded counter">
              <input className="input" value="PREFIX-{YYYY}-{#####}" readOnly disabled style={{ maxWidth: 320 }} />
            </Field>
          </div>
        </Card>
      )}
    </div>
  );
}
