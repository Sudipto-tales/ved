// Submit Work (student) — BEST-EFFORT WIRED. POST /assignments/{id}/submit resolves the
// student from the caller's membership server-side (self-service, no permission). Blob
// upload to MinIO is not wired yet, so files are referenced by storage_key + filename +
// size (the contract the backend already accepts). The assignment id comes from the route
// param when present, else a manual input.
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Field, Icon, PageHeader } from '@/shared/ui';
import { useSubmitWork, type SubmissionFileInput } from '../api/learningApi';

interface FileRow {
  storage_key: string;
  filename: string;
  size: string;
}

const emptyRow = (): FileRow => ({ storage_key: '', filename: '', size: '' });

export default function SubmitWorkPage() {
  const params = useParams();
  // The route is /assignments/:id/submit. A sentinel ":id" of "new" means "no preset
  // assignment" — fall back to a manual id input rather than a dead route.
  const presetId = params.id && params.id !== 'new' ? params.id : '';
  const [manualId, setManualId] = useState('');
  const assignmentId = presetId || manualId;
  const submit = useSubmitWork(assignmentId);
  const [rows, setRows] = useState<FileRow[]>([emptyRow()]);
  const [done, setDone] = useState<string | null>(null);

  const update = (i: number, key: keyof FileRow, val: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: val } : r)));

  const files: SubmissionFileInput[] = rows
    .filter((r) => r.storage_key.trim())
    .map((r) => ({ storage_key: r.storage_key.trim(), filename: r.filename.trim(), size: Number(r.size) || 0 }));

  return (
    <div>
      <PageHeader
        title="Submit Work"
        subtitle="Attach your files and submit. A resubmission is kept as a new version — your latest counts. Late submissions are flagged automatically."
      />

      {!presetId && (
        <Card>
          <Field label="Assignment id" hint="Enter the assignment you're submitting to.">
            <input className="input" placeholder="assignment_id" value={manualId} onChange={(e) => setManualId(e.target.value.trim())} />
          </Field>
        </Card>
      )}

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Files</h3>
        <p className="subtle" style={{ fontSize: 12, marginBottom: 12 }}>Blob upload is on the roadmap — reference each file by its storage key for now.</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((r, i) => (
            <div className="flex gap-8" key={i}>
              <input className="input" placeholder="storage_key" value={r.storage_key} onChange={(e) => update(i, 'storage_key', e.target.value)} />
              <input className="input" placeholder="filename" value={r.filename} onChange={(e) => update(i, 'filename', e.target.value)} style={{ maxWidth: 200 }} />
              <input className="input" placeholder="size" value={r.size} onChange={(e) => update(i, 'size', e.target.value)} style={{ maxWidth: 110 }} />
            </div>
          ))}
        </div>
        <div className="mt-16 flex gap-8">
          <Button variant="ghost" onClick={() => setRows((rs) => [...rs, emptyRow()])}>+ Add file</Button>
        </div>
      </Card>

      <Card className="mt-16">
        {submit.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(submit.error)}</p>}
        {done && (
          <EmptyState
            icon={<Icon name="graduation" size={28} />}
            title="Submitted"
            desc="Your work was recorded."
            action={<Badge tone="success">{done}</Badge>}
          />
        )}
        <div className="flex gap-8" style={{ alignItems: 'center' }}>
          <Button
            disabled={!assignmentId || files.length === 0 || submit.isPending}
            onClick={() => submit.mutate(files, { onSuccess: (res) => setDone(res.status) })}
          >
            {submit.isPending ? 'Submitting…' : 'Submit'}
          </Button>
          <span className="subtle" style={{ fontSize: 12 }}>{files.length} file(s) attached</span>
        </div>
      </Card>
    </div>
  );
}
