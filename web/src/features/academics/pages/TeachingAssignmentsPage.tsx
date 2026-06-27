// Teaching assignments (M5) — binds a teacher to a (section, subject). The anchor every
// LMS row (assignment, material) hangs off.
import { useState } from 'react';
import { Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, Select, StatCard } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { SetupGate } from '@/features/dashboard/setup/SetupGate';
import {
  useCreateTeachingAssignment,
  useSections,
  useSubjects,
  useTeachers,
  useTeachingAssignments,
  type TeachingAssignment,
} from '../api/academicsApi';

export default function TeachingAssignmentsPage() {
  const { data, isLoading, error } = useTeachingAssignments();
  const { data: sections } = useSections();
  const { data: subjects } = useSubjects();
  const { data: teachers } = useTeachers();
  const create = useCreateTeachingAssignment();

  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');

  const sectionName = (id: string) => {
    const s = sections?.sections.find((x) => x.id === id);
    return s ? `${s.program_name} — ${s.stage_name} ${s.name}` : id.slice(0, 8);
  };
  const subjectName = (id: string) => subjects?.subjects.find((x) => x.id === id)?.name ?? id.slice(0, 8);
  const teacherName = (id: string) => teachers?.teachers.find((x) => x.id === id)?.name ?? id.slice(0, 8);
  const rows = data?.teaching_assignments ?? [];

  return (
    <div>
      <PageHeader title="Teaching assignments" subtitle="Who teaches what, where — a teacher bound to a section + subject." />

      <SetupGate step="teaching-assignments" />

      <div className="grid-stats">
        <StatCard label="Assignments" value={rows.length} accent />
      </div>

      <Can permission="academics.manage">
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>New assignment</h3>
          {create.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(create.error)}</p>}
          <div className="flex gap-12">
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
            <Field label="Teacher">
              <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">Select…</option>
                {(teachers?.teachers ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <div style={{ alignSelf: 'flex-end' }}>
              <Button
                disabled={!sectionId || !subjectId || !teacherId || create.isPending}
                onClick={() => create.mutate(
                  { section_id: sectionId, subject_id: subjectId, teacher_id: teacherId },
                  { onSuccess: () => { setSubjectId(''); setTeacherId(''); } },
                )}
              >
                Assign
              </Button>
            </div>
          </div>
        </Card>
      </Can>

      <Card className="mt-16">
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<TeachingAssignment>
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={<Icon name="chart" />} title="No assignments yet" desc="Assign a teacher to a section and subject." />}
          columns={[
            { header: 'Section', cell: (r) => <span style={{ fontWeight: 600 }}>{sectionName(r.section_id)}</span> },
            { header: 'Subject', cell: (r) => subjectName(r.subject_id) },
            { header: 'Teacher', cell: (r) => teacherName(r.teacher_id) },
          ]}
        />
      </Card>
    </div>
  );
}
