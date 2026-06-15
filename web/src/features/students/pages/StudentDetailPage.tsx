// Student detail (M3 + academics) — the admission record, linked guardians, and a live
// academics summary (enrollment, attendance tally, exam marks). RLS-scoped.
import { Link, useParams } from 'react-router-dom';
import { Badge, Card, DataTable, EmptyState, Icon, PageHeader, Spinner, StatCard } from '@/shared/ui';
import { useStudent, useStudentAcademics } from '../api/studentsApi';

export default function StudentDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useStudent(id);
  const aca = useStudentAcademics(id);

  if (isLoading) return <div style={{ padding: 24 }}><Spinner /></div>;
  if (error) return <p style={{ color: 'var(--danger)', padding: 24 }}>Failed to load: {String(error)}</p>;
  if (!data) return null;

  const a = aca.data;
  const att = a?.attendance ?? {};
  const present = att.PRESENT ?? 0;
  const total = att.TOTAL ?? 0;
  const pct = total > 0 ? Math.round((present / total) * 100) : null;

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title={data.name} subtitle={`Admission #${data.admission_no}`} />
      <Link to="/students" className="subtle" style={{ fontSize: 13 }}>← Back to roster</Link>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Identity</h3>
        <div className="row"><span className="muted">Login</span><code>{data.login_identifier}</code></div>
        <div className="row"><span className="muted">Status</span><Badge tone={data.status === 'ACTIVE' ? 'success' : 'neutral'}>{data.status}</Badge></div>
        {data.gender && <div className="row"><span className="muted">Gender</span><span>{data.gender}</span></div>}
        {data.dob && <div className="row"><span className="muted">Date of birth</span><span>{data.dob}</span></div>}
        {data.prior_school && <div className="row"><span className="muted">Prior school</span><span>{data.prior_school}</span></div>}
      </Card>

      {/* Academics — enrollment + attendance + marks */}
      <Card className="mt-16">
        <div className="between flex">
          <h3 style={{ fontSize: 15 }}>Academics</h3>
          {a?.enrolled && (
            <span className="subtle" style={{ fontSize: 13 }}>
              {a.section_name}{a.roll_no ? ` · Roll ${a.roll_no}` : ''}
            </span>
          )}
        </div>

        {aca.isLoading && <div className="mt-16"><Spinner /></div>}
        {aca.error && <p style={{ color: 'var(--danger)' }}>Failed to load academics: {String(aca.error)}</p>}

        {a && !a.enrolled && (
          <EmptyState
            icon={<Icon name="graduation" />}
            title="Not enrolled yet"
            desc="Enroll this student into a section (Academics → Sections) to track attendance and marks."
          />
        )}

        {a?.enrolled && (
          <>
            <div className="grid-stats mt-16">
              <StatCard label="Attendance" value={pct === null ? '—' : `${pct}%`} accent />
              <StatCard label="Present" value={present} />
              <StatCard label="Absent" value={att.ABSENT ?? 0} />
              <StatCard label="Days recorded" value={total} />
            </div>

            <h4 style={{ fontSize: 13, color: 'var(--text-muted)', margin: '20px 0 8px', fontWeight: 700 }}>EXAM MARKS</h4>
            <DataTable
              rows={a.marks}
              rowKey={(_m, i) => String(i)}
              empty={<span className="muted">No exam marks recorded yet.</span>}
              columns={[
                { header: 'Exam', cell: (m) => <span style={{ fontWeight: 600 }}>{m.exam}</span> },
                { header: 'Subject', cell: (m) => m.subject },
                { header: 'Marks', align: 'right', cell: (m) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{m.marks} / {m.max_marks}</span> },
              ]}
            />
          </>
        )}
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Guardians</h3>
        {data.guardians.length === 0 && <p className="muted">No guardians linked.</p>}
        {data.guardians.map((g) => (
          <div className="row" key={g.id}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600 }}>{g.name}</span>
              <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>{g.relation}</span>
            </div>
            <span className="subtle" style={{ fontSize: 12 }}>{g.phone}</span>
            {g.is_primary && <Badge tone="neutral">primary</Badge>}
            {g.can_pay && <Badge tone="success">can pay</Badge>}
          </div>
        ))}
      </Card>
    </div>
  );
}
