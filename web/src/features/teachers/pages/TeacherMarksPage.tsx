// Teacher portal — Enter marks. WIRED to POST /api/v1/academics/marks (gated marks.enter).
// No roster endpoint is exposed to the portal, so the teacher enters an exam id + their
// teacher id, then adds rows (enrollment id, subject id, marks). Marks are append-only
// server-side: a re-entry is a new row, latest-by-hlc wins per subject.
import { useState } from 'react';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader } from '@/shared/ui';
import type { Column } from '@/shared/ui';
import { useEnterMarks, type MarkEntryInput } from '../api/teachersApi';

const emptyDraft = () => ({ enrollment_id: '', subject_id: '', marks: '' });

export default function TeacherMarksPage() {
  const enter = useEnterMarks();
  const [examId, setExamId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [draft, setDraft] = useState(emptyDraft());
  const [rows, setRows] = useState<MarkEntryInput[]>([]);
  const [done, setDone] = useState(false);

  const addRow = () => {
    if (!draft.enrollment_id.trim() || !draft.subject_id.trim() || draft.marks === '') return;
    setRows((rs) => [...rs, {
      enrollment_id: draft.enrollment_id.trim(),
      subject_id: draft.subject_id.trim(),
      marks: Number(draft.marks),
    }]);
    setDraft(emptyDraft());
  };

  const columns: Column<MarkEntryInput>[] = [
    { header: 'Enrollment', cell: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.enrollment_id}</span> },
    { header: 'Subject', cell: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.subject_id}</span> },
    { header: 'Marks', align: 'right', cell: (r) => <strong>{r.marks}</strong> },
  ];

  const canSubmit = !!examId && !!teacherId && rows.length > 0 && !enter.isPending;

  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader
        title="Enter marks"
        subtitle="Record exam marks for your students. Corrections are kept — a re-entry is a new row, latest counts."
      />

      <Card>
        <div className="flex gap-8">
          <Field label="Exam id">
            <input className="input" placeholder="exam_id" value={examId} onChange={(e) => setExamId(e.target.value.trim())} />
          </Field>
          <Field label="My teacher id" hint="Recorded as the grader.">
            <input className="input" placeholder="teacher_id" value={teacherId} onChange={(e) => setTeacherId(e.target.value.trim())} />
          </Field>
        </div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Add mark</h3>
        <div className="flex gap-8">
          <input className="input" placeholder="enrollment_id" value={draft.enrollment_id} onChange={(e) => setDraft({ ...draft, enrollment_id: e.target.value })} />
          <input className="input" placeholder="subject_id" value={draft.subject_id} onChange={(e) => setDraft({ ...draft, subject_id: e.target.value })} />
          <input className="input" placeholder="marks" value={draft.marks} onChange={(e) => setDraft({ ...draft, marks: e.target.value })} style={{ maxWidth: 110 }} />
          <Button variant="ghost" onClick={addRow}>+ Add</Button>
        </div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Marks to submit</h3>
        {rows.length === 0 ? (
          <EmptyState icon={<Icon name="graduation" size={28} />} title="No marks added" desc="Add enrollment + subject + marks rows above." />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(r, i) => `${r.enrollment_id}-${r.subject_id}-${i}`} />
        )}
      </Card>

      <Card className="mt-16">
        {enter.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(enter.error)}</p>}
        {done && !enter.isPending && <Badge tone="success">Saved {rows.length} mark entry(ies)</Badge>}
        <div className="mt-16">
          <Button
            disabled={!canSubmit}
            onClick={() => {
              setDone(false);
              enter.mutate(
                { exam_id: examId, graded_by: teacherId, entries: rows },
                { onSuccess: () => setDone(true) },
              );
            }}
          >
            {enter.isPending ? 'Saving…' : 'Save marks'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
