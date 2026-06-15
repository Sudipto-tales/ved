// Signup landing — sell + the plan picker. Plans come from the public GET /api/v1/plans.
// Picking a plan deep-links into the registration form with that plan preselected.
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, HeroBanner, Icon, Spinner } from '@/shared/ui';
import { usePlans, type Plan } from './api';

const TIER_TONE: Record<string, 'neutral' | 'primary' | 'warning'> = { T1: 'primary', T2: 'neutral', T3: 'warning' };

export default function SignupLandingPage() {
  const { data, isLoading, error } = usePlans();
  const navigate = useNavigate();
  const plans = data?.plans ?? [];

  return (
    <div>
      <HeroBanner
        tag="REGISTER YOUR SCHOOL"
        title="Run your whole school on VED"
        subtitle="Local-first school & college management — admissions, academics, finance, and LMS. Offline-ready, synced to the cloud."
        action={<div className="mt-16"><Button onClick={() => navigate('/signup/register')}>Register your school</Button></div>}
      />

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Choose a plan</h2>
      <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Pick the tier that fits your institution. You can change it later.</p>

      {isLoading && <div className="mt-16"><Spinner /></div>}
      {error && <p style={{ color: 'var(--danger)', marginTop: 12 }}>Could not load plans: {String(error)}</p>}

      <div className="grid-stats mt-16" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {plans.map((p: Plan) => (
          <Card key={p.id}>
            <div className="flex gap-8" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</span>
              <Badge tone={TIER_TONE[p.tier] ?? 'neutral'}>{p.tier}</Badge>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 12 }}>
              {p.currency} {p.price.toLocaleString()}
              <span className="subtle" style={{ fontSize: 13, fontWeight: 400 }}> / {p.billing_cycle.toLowerCase()}</span>
            </div>
            <ul style={{ marginTop: 12, fontSize: 13, listStyle: 'none', padding: 0, display: 'grid', gap: 6 }}>
              <li className="flex gap-8" style={{ alignItems: 'center' }}><Icon name="users" size={14} /> {p.seats} seats</li>
              <li className="flex gap-8" style={{ alignItems: 'center' }}><Icon name="layers" size={14} /> {(p.enabled_modules ?? []).length} modules</li>
            </ul>
            <div className="mt-16">
              <Button style={{ width: '100%' }} onClick={() => navigate(`/signup/register?plan=${p.id}`)}>Choose {p.name}</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
