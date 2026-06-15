// Attendance (M5, append-only) — pick a section + date, mark each enrolled student
// PRESENT/ABSENT/LATE/EXCUSED, submit as a batch. A re-mark is just new rows (latest by
// hlc wins on read); we pre-fill from any existing effective attendance for the date.
import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, Field, Icon, PageHeader, Select, Spinner } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useAttendance, useEnrollments, useMarkAttendance, useSections, useTeachers } from '../api/academicsApi';

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
const today = () => new Date().toISOString().slice(0, 10);

export default function AttendancePage() {
  const { data: sections } = useSections();
  const { data: teachers } = useTeachers();
  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(today());
  const [markedBy, setMarkedBy] = useState('');

  const { data: enrollData, isLoading } = useEnrollments(sectionId);
  const { data: existing } = useAttendance(sectionId, date);
  const mark = useMarkAttendance();

  const enrollments = enrollData?.enrollments ?? [];
  const [marks, setMarks] = useState<Record<string, string>>({});

  // Seed the form from existing effective attendance (or default PRESENT) when the
  // section/date roster changes.
  useEffect(() => {
    const seed: Record<string, string> = {};
    const prior = new Map((existing?.attendance ?? []).map((a) => [a.enrollment_id, a.status]));
    for (const e of enrollments) seed[e.id] = prior.get(e.id) ?? 'PRESENT';
    setMarks(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, date, enrollData, existing]);

  const submit = () => {
    mark.mutate({
      section_id: sectionId,
      marked_by: markedBy,
      date,
      entries: enrollments.map((e) => ({ enrollment_id: e.id, status: marks[e.id] ?? 'PRESENT' })),
    });
  };

  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader title="Attendance" subtitle="Append-only — a re-mark adds new rows; the latest by clock wins. Counts are derived on read." />

      <Card className="mt-16">
        <div className="flex gap-12">
          <Field label="Section">
            <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Select…</option>
              {(sections?.sections ?? []).map((s) => <option key={s.id} value={s.id}>{s.program_name} — {s.stage_name} {s.name}</option>)}
            </Select>
          </Field>
          <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Marked by (teacher)">
            <Select value={markedBy} onChange={(e) => setMarkedBy(e.target.value)}>
              <option value="">Select…</option>
              {(teachers?.teachers ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      {!sectionId && (
        <Card className="mt-16"><EmptyState icon={<Icon name="users" />} title="Pick a section" desc="Select a section and date to mark attendance." /></Card>
      )}

      {sectionId && (
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
                  <div className="flex gap-8">
                    {STATUSES.map((st) => (
                      <Button
                        key={st}
                        variant={marks[e.id] === st ? 'primary' : 'ghost'}
                        onClick={() => setMarks((m) => ({ ...m, [e.id]: st }))}
                      >
                        {st}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              <Can permission="attendance.mark">
                <div className="between mt-16">
                  {mark.error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{String(mark.error)}</span>}
                  {mark.isSuccess && <span style={{ color: 'var(--success)', fontSize: 13 }}>Saved.</span>}
                  <div className="grow" />
                  <Button disabled={!markedBy || mark.isPending} onClick={submit}>Submit attendance</Button>
                </div>
              </Can>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
