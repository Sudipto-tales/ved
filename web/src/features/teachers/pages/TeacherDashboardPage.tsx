// Teacher portal — Dashboard. The teacher's landing page (identity-scoped, no permission
// gate). Hero + at-a-glance stats + quick links into the day's tools. Section/class counts
// are placeholders until a "my sections" projection lands; the action tiles are live.
import { Link } from 'react-router-dom';
import { Button, HeroBanner, Icon, PageHeader, StatCard } from '@/shared/ui';
import { Can } from '@/shared/authz/Can';

function Tile({ to, icon, title, desc }: { to: string; icon: 'note' | 'graduation' | 'layers' | 'book'; title: string; desc: string }) {
  return (
    <Link to={to} className="card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div className="flex gap-8" style={{ alignItems: 'center', marginBottom: 6 }}>
        <Icon name={icon} size={20} />
        <span style={{ fontWeight: 600 }}>{title}</span>
      </div>
      <span className="subtle" style={{ fontSize: 13 }}>{desc}</span>
    </Link>
  );
}

export default function TeacherDashboardPage() {
  return (
    <div style={{ maxWidth: 920 }}>
      <PageHeader title="Dashboard" subtitle="Your teaching day at a glance." />

      <HeroBanner
        tag="Teacher portal"
        title="Welcome back"
        subtitle="Mark attendance, enter marks, publish assignments, and manage your classes — all from here."
        action={<Link to="/portal/teacher/attendance"><Button variant="secondary">Mark attendance</Button></Link>}
      />

      <div className="grid-stats mt-16">
        <StatCard label="My sections" value="—" accent />
        <StatCard label="Today's classes" value="—" />
        <StatCard label="Pending grading" value="—" />
      </div>

      <h3 style={{ fontSize: 15, margin: '24px 0 12px' }}>Quick actions</h3>
      <div className="grid-stats">
        <Tile to="/portal/teacher/sections" icon="layers" title="My sections" desc="Classes and students you teach." />
        <Can permission="attendance.mark">
          <Tile to="/portal/teacher/attendance" icon="note" title="Mark attendance" desc="Record present/absent for a section." />
        </Can>
        <Can permission="marks.enter">
          <Tile to="/portal/teacher/marks" icon="graduation" title="Enter marks" desc="Record exam marks for your students." />
        </Can>
        <Tile to="/teacher/assignments" icon="book" title="Assignments" desc="Publish and grade coursework." />
      </div>
    </div>
  );
}
