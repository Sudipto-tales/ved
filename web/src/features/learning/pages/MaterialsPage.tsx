// Materials (M8 LMS, T3a) — WIRED. Materials attach to an assignment, which lives under a
// teaching_assignment. Enter a teaching_assignment id → pick one of its assignments → list
// its materials and attach a new one (POST /assignments/{id}/materials; list via the GET
// added to learning.go). Files are referenced by storage_key (MinIO); URL/NOTE need no blob.
import { useState } from 'react';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, Select, Spinner } from '@/shared/ui';
import type { Column } from '@/shared/ui';
import { useAssignments, useMaterials, useAddMaterial, type Material } from '../api/learningApi';

// Matches the material.kind CHECK constraint in migration 00010_lms.sql.
const KINDS = ['NOTE', 'LINK', 'FILE'];

function MaterialList({ assignmentId }: { assignmentId: string }) {
  const list = useMaterials(assignmentId);
  const add = useAddMaterial(assignmentId);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('NOTE');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');

  const columns: Column<Material>[] = [
    { header: 'Title', cell: (m) => <span style={{ fontWeight: 600 }}>{m.title}</span> },
    { header: 'Kind', cell: (m) => <Badge tone="info">{m.kind}</Badge> },
    { header: 'Content', cell: (m) => <span className="subtle" style={{ fontSize: 12 }}>{m.url ?? m.body ?? '—'}</span> },
  ];

  return (
    <>
      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Attach material</h3>
        {add.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(add.error)}</p>}
        <div style={{ display: 'grid', gap: 10 }}>
          <Field label="Title">
            <input className="input" placeholder="e.g. Chapter 4 notes" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="flex gap-8">
            <Field label="Kind">
              <Select value={kind} onChange={(e) => setKind(e.target.value)} style={{ minWidth: 140 }}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </Field>
            <Field label="URL (for LINK)">
              <input className="input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
          </div>
          <Field label="Body (for NOTE)" hint="Inline text content; leave blank for link/file materials.">
            <input className="input" placeholder="Note text" value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <div>
            <Button
              disabled={!title.trim() || add.isPending}
              onClick={() => add.mutate(
                { title: title.trim(), kind, url: url.trim() || undefined, body: body.trim() || undefined },
                { onSuccess: () => { setTitle(''); setUrl(''); setBody(''); } },
              )}
            >
              {add.isPending ? 'Attaching…' : 'Attach material'}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Materials</h3>
        {list.isLoading && <Spinner />}
        {list.error && <p style={{ color: 'var(--danger)' }}>{String(list.error)}</p>}
        {!list.isLoading && (list.data?.materials.length ?? 0) === 0 ? (
          <EmptyState icon={<Icon name="layers" size={28} />} title="No materials yet" desc="Attach notes, links, or files for this assignment above." />
        ) : (
          <DataTable columns={columns} rows={list.data?.materials ?? []} rowKey={(m) => m.id} />
        )}
      </Card>
    </>
  );
}

export default function MaterialsPage() {
  const [taId, setTaId] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const assignments = useAssignments(taId);

  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader
        title="Materials"
        subtitle="Course content attached to an assignment. Pick a teaching assignment, choose an assignment, then attach notes, links, or files."
      />

      <Card>
        <Field label="Teaching assignment" hint="The teacher × subject × section binding.">
          <input className="input" placeholder="teaching_assignment_id" value={taId} onChange={(e) => { setTaId(e.target.value.trim()); setAssignmentId(''); }} />
        </Field>
        {taId && (
          <div className="mt-16">
            <Field label="Assignment">
              {assignments.isLoading ? <Spinner /> : (
                <Select value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
                  <option value="">Select an assignment…</option>
                  {assignments.data?.assignments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </Select>
              )}
            </Field>
            {!assignments.isLoading && (assignments.data?.assignments.length ?? 0) === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>No assignments on this teaching assignment yet — publish one first.</p>
            )}
          </div>
        )}
      </Card>

      {assignmentId && <MaterialList assignmentId={assignmentId} />}
    </div>
  );
}
