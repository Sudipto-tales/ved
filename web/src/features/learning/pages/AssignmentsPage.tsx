// Teacher assignments (M8 LMS authoring). Scoped to a teaching_assignment (teacher ×
// subject × section); enter its id to list/create assignments. A graded assignment with
// max_marks feeds the academics marks ledger server-side.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, PageHeader, Spinner } from '@/shared/ui';
import { useAssignments, useCreateAssignment } from '../api/learningApi';

export default function AssignmentsPage() {
  const [taId, setTaId] = useState('');
  const list = useAssignments(taId);
  const create = useCreateAssignment(taId);
  const [title, setTitle] = useState('');
  const [maxMarks, setMaxMarks] = useState('');
  const [due, setDue] = useState('');

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="Assignments" subtitle="Publish assignments to a class/subject. A graded assignment with max marks flows into the marks ledger automatically." />

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Teaching assignment</h3>
        <input className="input" placeholder="teaching_assignment_id" value={taId} onChange={(e) => setTaId(e.target.value.trim())} />
        <p className="subtle" style={{ fontSize: 12, marginTop: 6 }}>The teacher × subject × section binding these assignments belong to.</p>
      </Card>

      {taId && (
        <>
          <Card className="mt-16">
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>New assignment</h3>
            {create.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(create.error)}</p>}
            <div style={{ display: 'grid', gap: 10 }}>
              <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <div className="flex gap-8">
                <input className="input" placeholder="Max marks (optional)" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} style={{ maxWidth: 180 }} />
                <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ maxWidth: 180 }} />
                <Button
                  disabled={!title.trim() || create.isPending}
                  onClick={() => create.mutate(
                    { title: title.trim(), max_marks: maxMarks ? Number(maxMarks) : null, due_at: due || undefined },
                    { onSuccess: () => { setTitle(''); setMaxMarks(''); setDue(''); } },
                  )}
                >
                  Publish
                </Button>
              </div>
            </div>
          </Card>

          <Card className="mt-16">
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Published</h3>
            {list.isLoading && <Spinner />}
            {list.error && <p style={{ color: 'var(--danger)' }}>{String(list.error)}</p>}
            {!list.isLoading && (list.data?.assignments.length ?? 0) === 0 && <p className="muted">No assignments yet.</p>}
            {list.data?.assignments.map((a) => (
              <Link to={`/teacher/assignments/${a.id}`} className="row" key={a.id} style={{ textDecoration: 'none', color: 'inherit' }}>
                <span style={{ flex: 1, fontWeight: 600 }}>{a.title}</span>
                {a.max_marks != null && <Badge tone="neutral">/{a.max_marks}</Badge>}
                <Badge tone={a.status === 'PUBLISHED' ? 'success' : 'neutral'}>{a.status}</Badge>
              </Link>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
