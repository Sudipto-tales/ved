// Child timetable (M7, Tier-1) — DESIGNED SCAFFOLD. There is no timetable backend yet
// (carried-forward in docs/17 academics: timetable is post-roadmap), so this renders the
// finished layout with an EmptyState. When the timetable slice lands, the weekly grid
// drops into this same shell.
import { Link, useParams } from 'react-router-dom';
import { Card, EmptyState, Icon, PageHeader } from '@/shared/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export default function ChildTimetablePage() {
  const { childId = '' } = useParams();

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader
        title="Timetable"
        subtitle="Your child's weekly class schedule, as published by the school."
      />
      <Link to="/guardian" className="subtle" style={{ fontSize: 13 }}>
        ← Back to my children
      </Link>

      <Card className="mt-16">
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Preview of the weekly view (child #{childId.slice(0, 8)}).
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${DAYS.length}, 1fr)`, gap: 8 }}>
          {DAYS.map((d) => (
            <div key={d} className="card card--flat" style={{ padding: 12, textAlign: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{d}</div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 8 }}>—</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-16">
        <EmptyState
          icon={<Icon name="layers" />}
          title="Timetable not published yet"
          desc="The school hasn't published a class timetable. Once it does, your child's weekly schedule will appear here automatically."
        />
      </Card>
    </div>
  );
}
