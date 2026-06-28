// Teacher portal — Mark attendance. WIRED to POST /api/v1/academics/attendance (gated
// attendance.mark). There is no roster endpoint exposed to the teacher portal, so the
// teacher enters a section id + their teacher id + date, then adds enrollment rows and
// toggles each PRESENT/ABSENT/LATE/EXCUSED. Attendance is append-only server-side: a
// re-mark for the same (enrollment, date) is a new row, latest wins.
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, Field, Icon, PageHeader } from '@/shared/ui';
import { useMarkAttendance, type AttendanceEntry } from '../api/teachersApi';

const STATUSES: AttendanceEntry['status'][] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

interface Row {
  enrollment_id: string;
  status: AttendanceEntry['status'];
}

const today = () => new Date().toISOString().slice(0, 10);

export default function TeacherAttendancePage() {
  const mark = useMarkAttendance();
  const [sectionId, setSectionId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<Row[]>([]);
  const [newEnrollment, setNewEnrollment] = useState('');
  const [done, setDone] = useState(false);

  const addRow = () => {
    const id = newEnrollment.trim();
    if (!id || rows.some((r) => r.enrollment_id === id)) return;
    setRows((rs) => [...rs, { enrollment_id: id, status: 'PRESENT' }]);
    setNewEnrollment('');
  };

  const setStatus = (id: string, status: AttendanceEntry['status']) =>
    setRows((rs) => rs.map((r) => (r.enrollment_id === id ? { ...r, status } : r)));

  const canSubmit = !!sectionId && !!teacherId && !!date && rows.length > 0 && !mark.isPending;

  return (
    <div>
      <PageHeader
        title="Mark attendance"
        subtitle="Record attendance for a section on a date. Corrections are kept — a re-mark is a new entry, latest counts."
      />

      <Card>
        <div className="flex gap-8">
          <Field label="Section id">
            <input className="input" placeholder="section_id" value={sectionId} onChange={(e) => setSectionId(e.target.value.trim())} />
          </Field>
          <Field label="My teacher id" hint="Recorded as the marker.">
            <input className="input" placeholder="teacher_id" value={teacherId} onChange={(e) => setTeacherId(e.target.value.trim())} />
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 180 }} />
          </Field>
        </div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Roster</h3>
        <p className="subtle" style={{ fontSize: 12, marginBottom: 12 }}>Add students by enrollment id, then set each status. A roster lookup is on the roadmap.</p>
        <div className="flex gap-8" style={{ marginBottom: 12 }}>
          <input className="input" placeholder="enrollment_id" value={newEnrollment} onChange={(e) => setNewEnrollment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addRow()} />
          <Button variant="ghost" onClick={addRow}>+ Add student</Button>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={<Icon name="users" size={28} />} title="No students added" desc="Add enrollment ids above to build the roster." />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map((r) => (
              <div className="row" key={r.enrollment_id}>
                <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}>{r.enrollment_id}</span>
                <div className="flex gap-8">
                  {STATUSES.map((s) => (
                    <Button key={s} variant={r.status === s ? 'primary' : 'ghost'} onClick={() => setStatus(r.enrollment_id, s)}>{s}</Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-16">
        {mark.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(mark.error)}</p>}
        {done && !mark.isPending && <Badge tone="success">Attendance recorded for {rows.length} student(s)</Badge>}
        <div className="mt-16 flex gap-8" style={{ alignItems: 'center' }}>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              setDone(false);
              mark.mutate(
                { section_id: sectionId, marked_by: teacherId, date, entries: rows },
                { onSuccess: () => setDone(true) },
              );
            }}
          >
            {mark.isPending ? 'Saving…' : 'Save attendance'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
