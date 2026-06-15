// Bulk import students (DESIGNED SCAFFOLD) — the real layout for CSV admission imports.
// Parses the chosen file locally into a preview table so the flow looks real, but the
// Import action is disabled: there is no backend import endpoint yet. When it lands, each
// parsed row will run through the same one-transaction onboarding the wizard uses.
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon,
  PageHeader,
  Toolbar,
  type Column,
} from '@/shared/ui';

interface ParsedRow {
  name: string;
  admission_no: string;
  guardian_name: string;
  guardian_phone: string;
  _line: number;
}

const EXPECTED = ['name', 'admission_no', 'guardian_name', 'guardian_phone'];

const TEMPLATE = `name,admission_no,guardian_name,guardian_phone
Aarav Sharma,ADM-2026-001,Rohit Sharma,9876500001
Diya Patel,ADM-2026-002,Meera Patel,9876500002`;

function parseCsv(text: string): { rows: ParsedRow[]; headerOk: boolean } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], headerOk: false };
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const headerOk = EXPECTED.every((c) => header.includes(c));
  const idx = (c: string) => header.indexOf(c);
  const rows: ParsedRow[] = lines.slice(1).map((line, i) => {
    const cells = line.split(',');
    const at = (c: string) => (idx(c) >= 0 ? (cells[idx(c)] ?? '').trim() : '');
    return {
      name: at('name'),
      admission_no: at('admission_no'),
      guardian_name: at('guardian_name'),
      guardian_phone: at('guardian_phone'),
      _line: i + 2,
    };
  });
  return { rows, headerOk };
}

export default function ImportStudentsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headerOk, setHeaderOk] = useState(true);
  const [dragging, setDragging] = useState(false);

  function ingest(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ''));
      setRows(parsed.rows);
      setHeaderOk(parsed.headerOk);
    };
    reader.readAsText(file);
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) ingest(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) ingest(f);
  }

  function reset() {
    setFileName('');
    setRows([]);
    setHeaderOk(true);
    if (inputRef.current) inputRef.current.value = '';
  }

  const valid = (r: ParsedRow) => !!r.name && !!r.admission_no;
  const validCount = rows.filter(valid).length;

  const columns: Column<ParsedRow>[] = [
    { header: 'Line', width: 60, cell: (r) => <span className="muted">{r._line}</span> },
    { header: 'Name', cell: (r) => (r.name ? <span style={{ fontWeight: 600 }}>{r.name}</span> : <span style={{ color: 'var(--danger)' }}>missing</span>) },
    { header: 'Admission', cell: (r) => (r.admission_no ? <span className="subtle">#{r.admission_no}</span> : <span style={{ color: 'var(--danger)' }}>missing</span>) },
    { header: 'Guardian', cell: (r) => <span>{r.guardian_name || <span className="muted">—</span>}</span> },
    { header: 'Phone', cell: (r) => <span className="subtle">{r.guardian_phone || '—'}</span> },
    {
      header: 'Status',
      align: 'right',
      cell: (r) => (valid(r) ? <Badge tone="success">ready</Badge> : <Badge tone="warning">incomplete</Badge>),
    },
  ];

  return (
    <div style={{ maxWidth: 920 }}>
      <PageHeader
        title="Bulk import students"
        subtitle="Upload a CSV of admissions. Each row will be onboarded — login, membership, profile, and guardian links — in one transaction per student."
      />

      <Toolbar>
        <Link to="/students"><Button variant="ghost">← Roster</Button></Link>
        <span className="grow" />
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
          download="students-import-template.csv"
        >
          <Button variant="secondary">Download CSV template</Button>
        </a>
      </Toolbar>

      {/* Dropzone */}
      <Card className="mt-16">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 12,
            padding: '40px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'var(--surface-hover, rgba(0,0,0,0.02))' : 'transparent',
            transition: 'border-color .15s, background .15s',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: 'var(--primary)' }}>
            <Icon name="layers" size={32} />
          </div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            {fileName ? fileName : 'Drop a CSV here, or click to choose'}
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Columns: {EXPECTED.join(', ')}
          </div>
          <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={onPick} />
        </div>
      </Card>

      {/* Header validation hint */}
      {fileName && !headerOk && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }} className="mt-16">
          The CSV header is missing one or more expected columns: {EXPECTED.join(', ')}.
        </p>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <Card className="mt-16">
          <Toolbar>
            <h3 style={{ fontSize: 15, margin: 0 }}>Preview</h3>
            <span className="grow" />
            <Badge tone="success">{validCount} ready</Badge>
            {validCount < rows.length && <Badge tone="warning">{rows.length - validCount} incomplete</Badge>}
            <Button variant="ghost" onClick={reset}>Clear</Button>
          </Toolbar>
          <DataTable<ParsedRow> columns={columns} rows={rows} rowKey={(r) => String(r._line)} />
        </Card>
      )}

      {/* The not-yet-wired action + the honest note */}
      <Card className="mt-16">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="note" size={28} />}
            title="Bulk import is coming soon"
            desc="Choose a CSV above to preview how your admissions will map. The server-side importer — one transaction per student, with a dry-run validation pass — is on the M3 backlog."
          />
        ) : (
          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <Button disabled title="Bulk import endpoint is not available yet">
              Import {validCount} student{validCount === 1 ? '' : 's'}
            </Button>
            <span className="muted" style={{ fontSize: 13 }}>
              Import is disabled — the backend importer is not wired yet. This preview is local only.
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
