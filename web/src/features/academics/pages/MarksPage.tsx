// Marks (M5, append-only) — pick an exam + section + subject, enter a mark per enrolled
// student, submit as a batch. A re-grade is just new rows (latest by hlc wins on read).
// graded_by is a chosen teacher.
import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, Field, Icon, PageHeader, Select, Spinner } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useEnrollments, useEnterMarks, useExams, useSections, useSubjects, useTeachers } from '../api/academicsApi';

export default function MarksPage() {
  const { data: exams } = useExams();
  const { data: sections } = useSections();
  const { data: subjects } = useSubjects();
  const { data: teachers } = useTeachers();

  const [examId, setExamId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [gradedBy, setGradedBy] = useState('');

  const { data: enrollData, isLoading } = useEnrollments(sectionId);
  const enrollments = enrollData?.enrollments ?? [];
  const enter = useEnterMarks();

  const [marks, setMarks] = useState<Record<string, string>>({});
  useEffect(() => {
    setMarks({});
  }, [sectionId, examId, subjectId]);

  const exam = exams?.exams.find((e) => e.id === examId);

  const submit = () => {
    const entries = enrollments
      .filter((e) => marks[e.id] !== undefined && marks[e.id] !== '')
      .map((e) => ({ enrollment_id: e.id, subject_id: subjectId, marks: Number(marks[e.id]) }));
    if (entries.length === 0) return;
    enter.mutate({ exam_id: examId, graded_by: gradedBy, entries });
  };

  const ready = examId && sectionId && subjectId;

  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader title="Marks entry" subtitle="Append-only — a re-grade adds new rows; the latest by clock is effective. Pick exam, section and subject." />

      <Card className="mt-16">
        <div className="flex gap-12">
          <Field label="Exam">
            <Select value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">Select…</option>
              {(exams?.exams ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Field>
          <Field label="Section">
            <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Select…</option>
              {(sections?.sections ?? []).map((s) => <option key={s.id} value={s.id}>{s.program_name} — {s.stage_name} {s.name}</option>)}
            </Select>
          </Field>
          <Field label="Subject">
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Select…</option>
              {(subjects?.subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Graded by (teacher)">
            <Select value={gradedBy} onChange={(e) => setGradedBy(e.target.value)}>
              <option value="">Select…</option>
              {(teachers?.teachers ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      {!ready && (
        <Card className="mt-16"><EmptyState icon={<Icon name="chart" />} title="Pick exam, section & subject" desc="Choose all three to load the roster for marks entry." /></Card>
      )}

      {ready && (
        <Card className="mt-16">
          {isLoading && <Spinner />}
          {!isLoading && enrollments.length === 0 && (
            <EmptyState icon={<Icon name="users" />} title="No students enrolled" desc="Enroll students into this section first." />
          )}
          {!isLoading && enrollments.length > 0 && (
            <>
              {enrollments.map((e) => (
                <div className="row" key={e.id}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{e.login_identifier}</span>
                  <span className="subtle" style={{ marginRight: 8 }}>{e.roll_no ?? '—'}</span>
                  <input
                    className="input"
                    type="number"
                    placeholder={exam ? `/ ${exam.max_marks}` : 'marks'}
                    value={marks[e.id] ?? ''}
                    onChange={(ev) => setMarks((m) => ({ ...m, [e.id]: ev.target.value }))}
                    style={{ maxWidth: 120 }}
                  />
                </div>
              ))}
              <Can permission="marks.enter">
                <div className="between mt-16">
                  {enter.error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{String(enter.error)}</span>}
                  {enter.isSuccess && <span style={{ color: 'var(--success)', fontSize: 13 }}>Saved.</span>}
                  <div className="grow" />
                  <Button disabled={!gradedBy || enter.isPending} onClick={submit}>Submit marks</Button>
                </div>
              </Can>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
