// Child marks & report card (M7, Tier-1) — a guardian-scoped read of the ONE append-only
// marks ledger (academics.GetMarks, latest-per-subject by hlc). There is no guardian
// "exams list" tied to a child, so the guardian picks an exam from the school's exam set
// (GET /guardian/exams); the marks are then resolved against the child's active enrollment
// server-side. A child the guardian isn't linked to → 403 server-side.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Card,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  Select,
  Spinner,
  StatCard,
} from '@/shared/ui';
import { useChildMarks, useExams } from '../api/guardianApi';

export default function ChildMarksPage() {
  const { childId = '' } = useParams();
  const exams = useExams();
  const examList = exams.data?.exams ?? [];
  const [examId, setExamId] = useState('');

  // Default to the most recent exam once the list loads.
  useEffect(() => {
    if (!examId && examList.length > 0) setExamId(examList[0].id);
  }, [examId, examList]);

  const { data, isLoading, error } = useChildMarks(childId, examId);
  const marks = data?.marks ?? [];
  const selectedExam = examList.find((e) => e.id === examId);

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader
        title="Marks & report card"
        subtitle="Effective marks per subject — the latest grade from the school's marks ledger."
      />
      <Link to="/guardian" className="subtle" style={{ fontSize: 13 }}>
        ← Back to my children
      </Link>

      <Card className="mt-16">
        <Field label="Exam" hint="Pick an assessment to view this child's marks.">
          {exams.isLoading ? (
            <Spinner />
          ) : (
            <Select value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">Select an exam…</option>
              {examList.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} (out of {e.max_marks})
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Card>

      {!exams.isLoading && examList.length === 0 && (
        <Card className="mt-16">
          <EmptyState
            icon={<Icon name="graduation" />}
            title="No exams defined yet"
            desc="When the school sets up exams and records marks, this child's report card will appear here."
          />
        </Card>
      )}

      {examId && (
        <Card className="mt-16">
          {isLoading && <Spinner />}
          {error && <p style={{ color: 'var(--danger)' }}>{String(error)}</p>}
          {data?.note && <p className="muted">{data.note}</p>}
          {data && !data.note && marks.length === 0 && (
            <EmptyState
              icon={<Icon name="book" />}
              title="No marks recorded"
              desc={
                selectedExam
                  ? `No marks for ${selectedExam.name} have been entered for this child yet.`
                  : 'No marks recorded for this exam yet.'
              }
            />
          )}
          {marks.length > 0 && (
            <div className="grid-stats">
              {marks.map((m) => (
                <StatCard
                  key={m.subject_id}
                  label={m.subject_name || 'Subject'}
                  value={
                    selectedExam
                      ? `${m.marks} / ${selectedExam.max_marks}`
                      : m.marks
                  }
                  accent
                />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
