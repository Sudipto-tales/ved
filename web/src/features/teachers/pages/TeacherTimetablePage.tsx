// Teacher portal — My timetable. DESIGNED SCAFFOLD. There is no timetable model yet
// (carried-forward from academics). This is the clean shell with a week grid placeholder;
// when a timetable store ships it fills with the teacher's periods.
import { Card, EmptyState, Icon, PageHeader } from '@/shared/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TeacherTimetablePage() {
  return (
    <div>
      <PageHeader title="My timetable" subtitle="Your weekly teaching schedule." />

      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${DAYS.length}, 1fr)`, gap: 8, marginBottom: 16 }}>
          {DAYS.map((d) => (
            <div key={d} style={{ textAlign: 'center', fontWeight: 600, fontSize: 13, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>{d}</div>
          ))}
        </div>
        <EmptyState
          icon={<Icon name="grid" size={30} />}
          title="Timetable coming soon"
          desc="A timetable model (periods, rooms, slots) is on the academics roadmap. Once it ships, your weekly schedule renders here."
        />
      </Card>
    </div>
  );
}
