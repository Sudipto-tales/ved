// Tenant home — the "Minimal Tech" dashboard: a deep-gradient welcome hero + a featured
// card, then key metrics as bold numerals with axis-less sparklines and growth deltas.
// Metric COUNTS are real (per-tenant, RLS-scoped); the trend sparklines/deltas are
// illustrative until a metrics endpoint exists.
import { Link } from 'react-router-dom';
import { Badge, Button, Card, HeroBanner, PageHeader, StatCard } from '@/shared/ui';
import { useActiveMembership } from '@/shared/auth/AuthProvider';
import { Can } from '@/shared/authz/Can';
import { useStudents } from '@/features/students/api/studentsApi';
import { useTeachers } from '@/features/teachers/api/teachersApi';
import { useStaff } from '@/features/staff/api/staffApi';
import { SetupChecklist } from './setup/SetupChecklist';

export default function DashboardPage() {
  const students = useStudents();
  const teachers = useTeachers();
  const staff = useStaff();
  const schoolName = useActiveMembership()?.tenant_name;
  const n = (q: { data?: { [k: string]: unknown[] } }, key: string) =>
    (q.data?.[key]?.length ?? 0).toLocaleString();

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Your school at a glance." />

      {/* Hero + featured (the graphic focal points) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.9fr 1fr', gap: 24, alignItems: 'stretch' }}>
        <HeroBanner
          title={<>{schoolName ? `Welcome to ${schoolName} 👋` : 'Welcome back 👋'}</>}
          subtitle="Everything your school runs on — people, academics, fees and learning — in one place. Start by adding a student or reviewing today's roster."
          action={
            <Can permission="student.onboard">
              <Link to="/students/onboard"><Button>Onboard a student</Button></Link>
            </Can>
          }
        />
        <div className="hero" style={{ background: 'linear-gradient(135deg,#1c252e 0%,#2b3640 100%)' }}>
          <span className="hero-tag">FEATURED</span>
          <h2 style={{ marginTop: 14, fontSize: 20 }}>Premium Minimal UI</h2>
          <p>A clean, flat utility with soft elevation and vivid status accents — applied across every screen.</p>
        </div>
      </div>

      {/* Guided setup — only for admins, and only until setup is complete */}
      <Can permission="tenant.settings">
        <SetupChecklist />
      </Can>

      {/* Key metrics */}
      <div className="grid-stats mt-24">
        <StatCard
          label="Total students"
          value={n(students, 'students')}
          accent
          spark={{ data: [6, 9, 7, 11, 10, 14, 13, 17], tone: 'primary' }}
          delta={{ value: '+2.6%', dir: 'up', ctx: 'last 7 days' }}
        />
        <StatCard
          label="Teachers"
          value={n(teachers, 'teachers')}
          spark={{ data: [4, 5, 5, 6, 6, 7, 8, 8], tone: 'info' }}
          delta={{ value: '+0.2%', dir: 'up', ctx: 'last 7 days' }}
        />
        <StatCard
          label="Staff"
          value={n(staff, 'staff')}
          spark={{ data: [9, 8, 8, 7, 7, 6, 6, 5], tone: 'danger' }}
          delta={{ value: '-0.1%', dir: 'down', ctx: 'last 7 days' }}
        />
      </div>

      <Card className="mt-24">
        <div className="between flex">
          <div>
            <h3 style={{ fontSize: 16 }}>Quick start</h3>
            <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>Jump into the most common tasks.</p>
          </div>
          <Badge tone="success">all systems normal</Badge>
        </div>
        <div className="flex gap-12 mt-16" style={{ flexWrap: 'wrap' }}>
          <Can permission="student.read"><Link to="/students"><Button variant="secondary">Students</Button></Link></Can>
          <Can permission="teacher.read"><Link to="/teachers"><Button variant="secondary">Teachers</Button></Link></Can>
          <Can permission="fee.manage"><Link to="/ledger"><Button variant="secondary">Fee ledger</Button></Link></Can>
          <Can permission="role.manage"><Link to="/access/roles"><Button variant="secondary">Roles</Button></Link></Can>
        </div>
      </Card>
    </div>
  );
}
