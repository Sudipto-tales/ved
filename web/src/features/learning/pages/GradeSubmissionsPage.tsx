// Grade submissions (M8 LMS, T3b) — WIRED. A teacher's grading console: enter a teaching
// assignment → pick one of its assignments → see the latest submission per student → grade
// inline. Grading appends a new grade (immutable) and, if the assignment has max marks,
// feeds the one append-only marks ledger server-side. A re-grade is a new row, latest wins.
import { useState } from 'react';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, Select, Spinner } from '@/shared/ui';
import type { Column } from '@/shared/ui';
import { useAssignments, useSubmissions, useGrade, type SubmissionRow } from '../api/learningApi';

function GradeCell({ assignmentId, sub }: { assignmentId: string; sub: SubmissionRow }) {
  const grade = useGrade(assignmentId);
  const [marks, setMarks] = useState('');
  return (
    <div className="flex gap-8" style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
      <input className="input" placeholder="marks" value={marks} onChange={(e) => setMarks(e.target.value)} style={{ maxWidth: 90 }} />
      <Button
        disabled={marks === '' || grade.isPending}
        onClick={() => grade.mutate({ submissionId: sub.submission_id, marks: Number(marks) }, { onSuccess: () => setMarks('') })}
      >
        {grade.isPending ? '…' : 'Grade'}
      </Button>
    </div>
  );
}

function Submissions({ assignmentId }: { assignmentId: string }) {
  const { data, isLoading, error } = useSubmissions(assignmentId);
  const rows = data?.submissions ?? [];

  const columns: Column<SubmissionRow>[] = [
    { header: 'Student', cell: (s) => <span style={{ fontWeight: 600 }}>{s.student}</span> },
    { header: 'Status', cell: (s) => <Badge tone={s.status === 'LATE' ? 'warning' : 'success'}>{s.status}</Badge> },
    { header: 'Current', cell: (s) => <span className="subtle" style={{ fontSize: 12 }}>{s.marks != null ? `graded ${s.marks}` : 'ungraded'}</span> },
    { header: 'Grade', align: 'right', width: 200, cell: (s) => <GradeCell assignmentId={assignmentId} sub={s} /> },
  ];

  if (error) return <p style={{ color: 'var(--danger)' }}>{String(error)}</p>;
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(s) => s.submission_id}
      loading={isLoading}
      empty={<EmptyState icon={<Icon name="note" size={28} />} title="No submissions yet" desc="Students who submit this assignment will appear here, latest submission per student." />}
    />
  );
}

export default function GradeSubmissionsPage() {
  const [taId, setTaId] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const assignments = useAssignments(taId);

  return (
    <div>
      <PageHeader
        title="Grade Submissions"
        subtitle="Grade student work. A graded assignment with max marks flows into the append-only marks ledger automatically."
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
                  {assignments.data?.assignments.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}{a.max_marks != null ? ` (/${a.max_marks})` : ''}</option>
                  ))}
                </Select>
              )}
            </Field>
            {!assignments.isLoading && (assignments.data?.assignments.length ?? 0) === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>No assignments on this teaching assignment yet.</p>
            )}
          </div>
        )}
      </Card>

      {assignmentId && (
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Submissions</h3>
          <Submissions assignmentId={assignmentId} />
        </Card>
      )}
    </div>
  );
}
