// Section detail — the roster (enrollments via the enrollments endpoint) + enroll a
// student into this section.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, Select, StatCard } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';
import { useEnroll, useEnrollments, useSections, useStudentsRef, type Enrollment } from '../api/academicsApi';

export default function SectionDetailPage() {
  const { id = '' } = useParams();
  const { data: sectionsData } = useSections();
  const section = sectionsData?.sections.find((s) => s.id === id);
  const { data, isLoading, error } = useEnrollments(id);
  const { data: students } = useStudentsRef();
  const enroll = useEnroll(id);

  const [studentId, setStudentId] = useState('');
  const [rollNo, setRollNo] = useState('');
  const rows = data?.enrollments ?? [];
  const enrolledIds = new Set(rows.map((r) => r.student_id));
  const available = (students?.students ?? []).filter((s) => !enrolledIds.has(s.id));

  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader title={section ? `${section.program_name} — ${section.stage_name} ${section.name}` : 'Section'} subtitle="The enrolled students (roster) for this section." />
      <Link to="/sections" className="subtle" style={{ fontSize: 13 }}>← Back to sections</Link>

      <div className="grid-stats mt-16">
        <StatCard label="Enrolled" value={rows.length} accent />
        <StatCard label="Capacity" value={section?.capacity ?? '—'} />
      </div>

      <Can permission="academics.manage">
        <Card className="mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Enroll a student</h3>
          {enroll.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(enroll.error)}</p>}
          <div className="flex gap-12">
            <Field label="Student">
              <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">Select…</option>
                {available.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.login_identifier})</option>)}
              </Select>
            </Field>
            <Field label="Roll no" hint="optional"><input className="input" placeholder="e.g. 12" value={rollNo} onChange={(e) => setRollNo(e.target.value)} style={{ maxWidth: 120 }} /></Field>
            <div style={{ alignSelf: 'flex-end' }}>
              <Button
                disabled={!studentId || enroll.isPending}
                onClick={() => enroll.mutate({ student_id: studentId, roll_no: rollNo || undefined }, { onSuccess: () => { setStudentId(''); setRollNo(''); } })}
              >
                Enroll
              </Button>
            </div>
          </div>
        </Card>
      </Can>

      <Card className="mt-16">
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        <DataTable<Enrollment>
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={<Icon name="users" />} title="No students enrolled" desc="Enroll the first student into this section." />}
          columns={[
            { header: 'Roll', cell: (r) => <span className="subtle">{r.roll_no ?? '—'}</span>, width: 80 },
            { header: 'Login', cell: (r) => <span style={{ fontWeight: 600 }}>{r.login_identifier}</span> },
            { header: 'Status', cell: (r) => <Badge tone={r.status === 'ACTIVE' ? 'success' : 'neutral'}>{r.status}</Badge> },
          ]}
        />
      </Card>
    </div>
  );
}
