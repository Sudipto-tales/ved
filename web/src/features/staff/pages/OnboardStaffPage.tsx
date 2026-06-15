// Onboard staff (M5, direct/skip path). Returns the generated login + one-time temp
// password to hand over (docs/06).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, PageHeader } from '@/shared/ui';
import { useOnboardStaff, type OnboardResult } from '../api/staffApi';

export default function OnboardStaffPage() {
  const onboard = useOnboardStaff();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [dept, setDept] = useState('');
  const [desig, setDesig] = useState('');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState('');
  const [result, setResult] = useState<OnboardResult | null>(null);

  if (result) {
    return (
      <div style={{ maxWidth: 560 }}>
        <PageHeader title="Staff onboarded" subtitle="Hand these credentials over. The password is shown once and must be reset on first login." />
        <Card className="mt-16">
          <div className="row"><span className="muted">Login</span><code>{result.login_identifier}</code></div>
          <div className="row"><span className="muted">Temporary password</span><code>{result.temp_password}</code></div>
          <div className="row"><span className="muted">Status</span><Badge tone="success">must reset on first login</Badge></div>
        </Card>
        <div className="flex gap-8 mt-16">
          <Link to={`/staff/${result.employee_id}`}><Button>View staff</Button></Link>
          <Button variant="ghost" onClick={() => { setResult(null); setName(''); setDept(''); setDesig(''); setCode(''); setJoining(''); }}>Onboard another</Button>
          <Button variant="ghost" onClick={() => navigate('/staff')}>Back to roster</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <PageHeader title="Onboard staff" subtitle="Creates the login, membership, and staff profile in one transaction." />
      {onboard.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(onboard.error)}</p>}
      <Card className="mt-16">
        <div style={{ display: 'grid', gap: 10 }}>
          <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-8">
            <input className="input" placeholder="Department (e.g. Accounts)" value={dept} onChange={(e) => setDept(e.target.value)} />
            <input className="input" placeholder="Designation (display title)" value={desig} onChange={(e) => setDesig(e.target.value)} />
          </div>
          <input className="input" placeholder="Employee code (optional)" value={code} onChange={(e) => setCode(e.target.value)} />
          <input className="input" type="date" value={joining} onChange={(e) => setJoining(e.target.value)} />
        </div>
      </Card>
      <div className="flex gap-8 mt-16">
        <Button
          disabled={!name.trim() || onboard.isPending}
          onClick={() => onboard.mutate(
            { name: name.trim(), department: dept || undefined, designation: desig || undefined, employee_code: code || undefined, joining_date: joining || undefined },
            { onSuccess: (r) => setResult(r) },
          )}
        >
          {onboard.isPending ? 'Onboarding…' : 'Onboard staff'}
        </Button>
        <Button variant="ghost" onClick={() => navigate('/staff')}>Cancel</Button>
      </div>
    </div>
  );
}
