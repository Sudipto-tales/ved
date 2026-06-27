// Assignment detail (M8) — the grading screen. Lists the latest submission per student
// with its current grade; grading appends a new grade (and a marks-ledger entry if the
// assignment has max marks). Append-only: a re-grade is a new row, latest wins.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, PageHeader, Spinner } from '@/shared/ui';
import { useSubmissions, useGrade } from '../api/learningApi';

function GradeRow({ assignmentId, sub }: { assignmentId: string; sub: { submission_id: string; student: string; status: string; marks: number | null } }) {
  const grade = useGrade(assignmentId);
  const [marks, setMarks] = useState('');
  return (
    <div className="row">
      <span style={{ flex: 1, fontWeight: 600 }}>{sub.student}</span>
      <Badge tone={sub.status === 'LATE' ? 'neutral' : 'success'}>{sub.status}</Badge>
      <span className="subtle" style={{ fontSize: 12, minWidth: 60 }}>{sub.marks != null ? `graded ${sub.marks}` : 'ungraded'}</span>
      <input className="input" placeholder="marks" value={marks} onChange={(e) => setMarks(e.target.value)} style={{ maxWidth: 90 }} />
      <Button
        disabled={marks === '' || grade.isPending}
        onClick={() => grade.mutate({ submissionId: sub.submission_id, marks: Number(marks) }, { onSuccess: () => setMarks('') })}
      >
        Grade
      </Button>
    </div>
  );
}

export default function AssignmentDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useSubmissions(id);

  return (
    <div>
      <PageHeader title="Submissions & grading" subtitle="Latest submission per student. Grading an assignment with max marks writes into the append-only marks ledger." />
      <Link to="/teacher/assignments" className="subtle" style={{ fontSize: 13 }}>← Back to assignments</Link>
      <Card className="mt-16">
        {isLoading && <Spinner />}
        {error && <p style={{ color: 'var(--danger)' }}>{String(error)}</p>}
        {!isLoading && (data?.submissions.length ?? 0) === 0 && <p className="muted">No submissions yet.</p>}
        {data?.submissions.map((s) => (
          <GradeRow key={s.submission_id} assignmentId={id} sub={s} />
        ))}
      </Card>
    </div>
  );
}
