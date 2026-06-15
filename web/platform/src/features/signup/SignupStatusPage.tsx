// Registration status tracker. Polls GET /api/v1/registrations/{id} and renders the
// state-machine progress as a stepper. On ACTIVE we tell them the admin login was created
// and credentials will be delivered out-of-band (the platform admin hands them over).
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Icon, PageHeader, Spinner } from '@/shared/ui';
import { useRegistrationStatus } from './api';

// Ordered states of the onboarding state machine (docs/01).
const STEPS = [
  { key: 'ADMIN_REGISTERED', label: 'Registered', desc: 'School account created.' },
  { key: 'ONBOARDING', label: 'Onboarding', desc: 'Plan selected — submit your payment proof.' },
  { key: 'PENDING_PAYMENT_REVIEW', label: 'Under review', desc: 'Our team is verifying your payment.' },
  { key: 'ACTIVE', label: 'Active', desc: 'Your school is provisioned and licensed.' },
];
const ORDER: Record<string, number> = { ADMIN_REGISTERED: 0, ONBOARDING: 1, PENDING_PAYMENT_REVIEW: 2, ACTIVE: 3 };

export default function SignupStatusPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useRegistrationStatus(id, true);

  const status = data?.status ?? '';
  const rejected = status === 'REJECTED';
  const active = status === 'ACTIVE';
  const current = ORDER[status] ?? 0;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <PageHeader title="Registration status" subtitle={rejected ? 'Your registration was not approved.' : 'We refresh this automatically while your school is being set up.'} />

      {isLoading && <Card className="mt-16"><Spinner /></Card>}
      {error && <Card className="mt-16"><EmptyState icon={<Icon name="building" />} title="Not found" desc="We couldn't find that registration." action={<Button onClick={() => navigate('/signup')}>Back to start</Button>} /></Card>}

      {data && (
        <>
          <Card className="mt-16">
            <div className="flex gap-8" style={{ alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{data.school_name}</span>
              <span className="subtle" style={{ fontSize: 12 }}>/{data.slug}</span>
              <Badge tone={rejected ? 'warning' : active ? 'success' : 'neutral'}>{status}</Badge>
            </div>

            {rejected ? (
              <div className="mt-16">
                <EmptyState
                  icon={<Icon name="shield" />}
                  title="Registration rejected"
                  desc="Your payment proof could not be verified. Please contact support or register again."
                  action={<Button onClick={() => navigate('/signup/register')}>Register again</Button>}
                />
              </div>
            ) : (
              <ol style={{ listStyle: 'none', padding: 0, margin: '20px 0 0', display: 'grid', gap: 14 }}>
                {STEPS.map((step, i) => {
                  const done = i < current;
                  const isCurrent = i === current;
                  return (
                    <li key={step.key} className="flex gap-12" style={{ alignItems: 'flex-start', opacity: done || isCurrent ? 1 : 0.45 }}>
                      <span
                        className="brand-badge"
                        style={{
                          width: 26, height: 26, flexShrink: 0,
                          background: done ? 'var(--success)' : isCurrent ? 'var(--primary)' : 'var(--border)',
                          color: done || isCurrent ? '#fff' : 'var(--muted)',
                        }}
                      >
                        {done ? <Icon name="shield" size={13} /> : <span style={{ fontSize: 12, fontWeight: 700 }}>{i + 1}</span>}
                      </span>
                      <div>
                        <div className="flex gap-8" style={{ alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>{step.label}</span>
                          {isCurrent && !active && <Spinner />}
                        </div>
                        <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>{step.desc}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          {status === 'ONBOARDING' && (
            <div className="mt-16"><Button onClick={() => navigate(`/signup/proof/${id}`)} style={{ width: '100%' }}>Submit payment proof</Button></div>
          )}

          {active && (
            <Card className="mt-16" style={{ borderColor: 'var(--accent)' }}>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>You're live</h3>
              <p style={{ fontSize: 13 }}>
                Your school admin login has been created. Our team will deliver the credentials
                to <strong>{data.admin_email}</strong> shortly — for security they are shown once and handed over directly.
              </p>
              <div className="mt-16"><Button variant="ghost" onClick={() => navigate('/login')}>Go to admin sign in</Button></div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
