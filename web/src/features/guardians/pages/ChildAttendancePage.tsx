// Child attendance (M7) — a guardian-scoped projection of academics attendance (summed,
// never stored). A guardian requesting a child they aren't linked to gets 403 server-side.
import { Link, useParams } from 'react-router-dom';
import { PageHeader, Spinner, StatCard } from '@/shared/ui';
import { useChildAttendance } from '../api/guardianApi';

export default function ChildAttendancePage() {
  const { childId = '' } = useParams();
  const { data, isLoading, error } = useChildAttendance(childId);
  const s = data?.summary ?? {};

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Derived from attendance events — the latest mark per day, summed." />
      <Link to="/guardian" className="subtle" style={{ fontSize: 13 }}>← Back to my children</Link>
      {isLoading && <div className="mt-16"><Spinner /></div>}
      {error && <p style={{ color: 'var(--danger)' }}>{String(error)}</p>}
      {data && (
        <>
          {data.note && <p className="muted mt-16">{data.note}</p>}
          <div className="grid-stats mt-16">
            <StatCard label="Present" value={s.PRESENT ?? 0} accent />
            <StatCard label="Absent" value={s.ABSENT ?? 0} />
            <StatCard label="Late" value={s.LATE ?? 0} />
            <StatCard label="Days recorded" value={s.TOTAL ?? 0} />
          </div>
        </>
      )}
    </div>
  );
}
