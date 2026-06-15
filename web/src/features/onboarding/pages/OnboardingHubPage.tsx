// Onboarding hub (DESIGNED SCAFFOLD). A stepper-style launchpad that routes staff into the
// real, built onboarding flows (students / teachers / staff each run the shared onboarding
// engine end-to-end). The steps themselves are links; this page is the orientation layer.
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Icon, PageHeader, type IconName } from '@/shared/ui';

interface Flow {
  to: string;
  icon: IconName;
  title: string;
  desc: string;
  ready: boolean;
}

const FLOWS: Flow[] = [
  {
    to: '/students/onboard',
    icon: 'graduation',
    title: 'Onboard a student',
    desc: 'Admission record, guardians, and login — created in one transaction with credentials shown once.',
    ready: true,
  },
  {
    to: '/teachers/onboard',
    icon: 'users',
    title: 'Onboard a teacher',
    desc: 'Teacher profile + membership + roles via the shared onboarding engine.',
    ready: true,
  },
  {
    to: '/staff/onboard',
    icon: 'user-plus',
    title: 'Onboard staff',
    desc: 'Employee profile + membership + roles for non-teaching staff.',
    ready: true,
  },
];

const STEPS = [
  { n: 1, label: 'Choose person type' },
  { n: 2, label: 'Capture details' },
  { n: 3, label: 'Assign roles' },
  { n: 4, label: 'Generate credentials' },
];

export default function OnboardingHubPage() {
  return (
    <div style={{ maxWidth: 920 }}>
      <PageHeader
        title="Onboarding"
        subtitle="Bring people into the institution. Each flow runs the shared onboarding engine — one transaction, credentials issued once."
      />

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 16 }}>How onboarding works</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 600,
                    background: 'var(--accent-tint, #eef2ff)',
                    color: 'var(--primary)',
                  }}
                >
                  {s.n}
                </span>
                <span style={{ fontSize: 13 }}>{s.label}</span>
              </span>
              {i < STEPS.length - 1 && <span className="subtle">→</span>}
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-16" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {FLOWS.map((f) => (
          <Card key={f.to}>
            <div className="flex gap-8" style={{ alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: 'var(--primary)' }}>
                <Icon name={f.icon} size={22} />
              </span>
              {f.ready ? <Badge tone="success">ready</Badge> : <Badge tone="neutral">soon</Badge>}
            </div>
            <h3 style={{ fontSize: 15, marginBottom: 6 }}>{f.title}</h3>
            <p className="subtle" style={{ fontSize: 13, minHeight: 56 }}>
              {f.desc}
            </p>
            <Link to={f.to}>
              <Button>Start</Button>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
