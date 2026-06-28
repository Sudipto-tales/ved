// STUDENT portal — Dashboard (DESIGNED SCAFFOLD). Identity-scoped: the student lands
// here. Real layout — hero greeting + a row of summary StatCards + quick links — with
// placeholder values until the "my-data" endpoints (attendance, fees, marks) are wired.
import { Link } from 'react-router-dom';
import { Badge, Card, HeroBanner, Icon, StatCard, type IconName } from '@/shared/ui';

const QUICK_LINKS: { to: string; label: string; icon: IconName }[] = [
  { to: '/student/profile', label: 'My profile', icon: 'users' },
  { to: '/student/attendance', label: 'Attendance', icon: 'chart' },
  { to: '/student/marks', label: 'Marks', icon: 'book' },
  { to: '/student/timetable', label: 'Timetable', icon: 'grid' },
  { to: '/student/fees', label: 'Fees', icon: 'wallet' },
  { to: '/student/notices', label: 'Notices', icon: 'bell' },
];

export default function StudentDashboardPage() {
  return (
    <div>
      <HeroBanner
        tag="STUDENT PORTAL"
        title="Welcome back"
        subtitle="Your attendance, marks, timetable, fees, and notices — all in one place. Live data lands here as each section comes online."
      />

      <div className="grid-stats mt-16">
        <StatCard
          label="Attendance (this term)"
          value={<span className="muted">—</span>}
          spark={{ data: [3, 4, 4, 5, 4, 5, 5], tone: 'primary' }}
        />
        <StatCard label="Outstanding dues" value={<span className="muted">—</span>} />
        <StatCard label="Latest result" value={<span className="muted">—</span>} />
        <StatCard label="Unread notices" value={<Badge tone="neutral">soon</Badge>} />
      </div>

      <h3 style={{ fontSize: 15, margin: '24px 0 12px' }}>Quick links</h3>
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        }}
      >
        {QUICK_LINKS.map((q) => (
          <Link key={q.to} to={q.to} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Card>
              <div className="flex gap-8" style={{ alignItems: 'center' }}>
                <span style={{ color: 'var(--primary)' }}><Icon name={q.icon} /></span>
                <span style={{ fontWeight: 600 }}>{q.label}</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
