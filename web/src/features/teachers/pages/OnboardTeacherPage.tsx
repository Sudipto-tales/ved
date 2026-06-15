// Onboard teacher (M5, direct/skip path). One submit → identity + profile in one tx;
// returns the generated login + one-time temp password to hand over (docs/06).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, PageHeader } from '@/shared/ui';
import { useOnboardTeacher, type OnboardResult } from '../api/teachersApi';

export default function OnboardTeacherPage() {
  const onboard = useOnboardTeacher();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [spec, setSpec] = useState('');
  const [joining, setJoining] = useState('');
  const [result, setResult] = useState<OnboardResult | null>(null);

  if (result) {
    return (
      <div style={{ maxWidth: 560 }}>
        <PageHeader title="Teacher onboarded" subtitle="Hand these credentials over. The password is shown once and must be reset on first login." />
        <Card className="mt-16">
          <div className="row"><span className="muted">Login</span><code>{result.login_identifier}</code></div>
          <div className="row"><span className="muted">Temporary password</span><code>{result.temp_password}</code></div>
          <div className="row"><span className="muted">Status</span><Badge tone="success">must reset on first login</Badge></div>
        </Card>
        <div className="flex gap-8 mt-16">
          <Link to={`/teachers/${result.teacher_id}`}><Button>View teacher</Button></Link>
          <Button variant="ghost" onClick={() => { setResult(null); setName(''); setCode(''); setSpec(''); setJoining(''); }}>Onboard another</Button>
          <Button variant="ghost" onClick={() => navigate('/teachers')}>Back to roster</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <PageHeader title="Onboard teacher" subtitle="Creates the login, membership, and teaching profile in one transaction." />
      {onboard.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(onboard.error)}</p>}
      <Card className="mt-16">
        <div style={{ display: 'grid', gap: 10 }}>
          <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Employee code (optional)" value={code} onChange={(e) => setCode(e.target.value)} />
          <input className="input" placeholder="Specialization (optional)" value={spec} onChange={(e) => setSpec(e.target.value)} />
          <input className="input" type="date" value={joining} onChange={(e) => setJoining(e.target.value)} />
        </div>
      </Card>
      <div className="flex gap-8 mt-16">
        <Button
          disabled={!name.trim() || onboard.isPending}
          onClick={() => onboard.mutate(
            { name: name.trim(), employee_code: code || undefined, specialization: spec || undefined, joining_date: joining || undefined },
            { onSuccess: (r) => setResult(r) },
          )}
        >
          {onboard.isPending ? 'Onboarding…' : 'Onboard teacher'}
        </Button>
        <Button variant="ghost" onClick={() => navigate('/teachers')}>Cancel</Button>
      </div>
    </div>
  );
}
