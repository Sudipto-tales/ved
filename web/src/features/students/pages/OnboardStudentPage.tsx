// Onboard student (M3, Path B — direct/skip). One submit → server creates user +
// membership + profile + guardian(s) + links + outbox + audit in a single transaction
// and returns the generated login + one-time temp password, which we display ONCE for
// staff to hand over (docs/06). The wizard/approval flow layers on later.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, PageHeader } from '@/shared/ui';
import { useOnboardStudent, type GuardianInput, type OnboardResult } from '../api/studentsApi';

const RELATIONS = ['FATHER', 'MOTHER', 'GUARDIAN', 'GRANDPARENT', 'SIBLING', 'OTHER'];
const GENDERS = ['', 'MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'];

const emptyGuardian: GuardianInput = {
  name: '',
  phone: '',
  email: '',
  relation: 'FATHER',
  is_primary: true,
  can_pay: true,
};

export default function OnboardStudentPage() {
  const onboard = useOnboardStudent();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [admissionNo, setAdmissionNo] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [addGuardian, setAddGuardian] = useState(true);
  const [guardian, setGuardian] = useState<GuardianInput>(emptyGuardian);
  const [result, setResult] = useState<OnboardResult | null>(null);

  function submit() {
    const guardians = addGuardian && guardian.name && guardian.phone ? [guardian] : [];
    onboard.mutate(
      {
        name: name.trim(),
        admission_no: admissionNo.trim(),
        dob: dob || undefined,
        gender: gender || undefined,
        guardians,
      },
      { onSuccess: (r) => setResult(r) },
    );
  }

  // --- Success: show the generated credentials once ---
  if (result) {
    return (
      <div style={{ maxWidth: 560 }}>
        <PageHeader title="Student onboarded" subtitle="Hand these credentials to the student. The password is shown only once and must be reset on first login." />
        <Card className="mt-16">
          <div className="row"><span className="muted">Login</span><code>{result.login_identifier}</code></div>
          <div className="row"><span className="muted">Temporary password</span><code>{result.temp_password}</code></div>
          <div className="row"><span className="muted">Admission no</span><span>#{result.admission_no}</span></div>
          <div className="row"><span className="muted">Status</span><Badge tone="success">must reset on first login</Badge></div>
        </Card>
        <div className="flex gap-8 mt-16">
          <Link to={`/students/${result.student_id}`}><Button>View student</Button></Link>
          <Button variant="ghost" onClick={() => { setResult(null); setName(''); setAdmissionNo(''); setDob(''); setGender(''); setGuardian(emptyGuardian); }}>
            Onboard another
          </Button>
          <Button variant="ghost" onClick={() => navigate('/students')}>Back to roster</Button>
        </div>
      </div>
    );
  }

  const canSubmit = name.trim() && admissionNo.trim() && !onboard.isPending;

  return (
    <div style={{ maxWidth: 560 }}>
      <PageHeader title="Onboard student" subtitle="Creates the login, membership, admission record, and guardian links in one transaction." />

      {onboard.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(onboard.error)}</p>}

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Student</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Admission number" value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} />
          <div className="flex gap-8">
            <input className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
              {GENDERS.map((g) => <option key={g} value={g}>{g || 'Gender…'}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <Card className="mt-16">
        <label className="flex gap-8" style={{ alignItems: 'center', fontSize: 14, marginBottom: 12 }}>
          <input type="checkbox" checked={addGuardian} onChange={(e) => setAddGuardian(e.target.checked)} />
          Add a primary guardian
        </label>
        {addGuardian && (
          <div style={{ display: 'grid', gap: 10 }}>
            <input className="input" placeholder="Guardian name" value={guardian.name} onChange={(e) => setGuardian({ ...guardian, name: e.target.value })} />
            <div className="flex gap-8">
              <input className="input" placeholder="Phone" value={guardian.phone} onChange={(e) => setGuardian({ ...guardian, phone: e.target.value })} />
              <select className="input" value={guardian.relation} onChange={(e) => setGuardian({ ...guardian, relation: e.target.value })}>
                {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <input className="input" placeholder="Email (optional)" value={guardian.email} onChange={(e) => setGuardian({ ...guardian, email: e.target.value })} />
            <div className="flex gap-8" style={{ fontSize: 13 }}>
              <label className="flex gap-8" style={{ alignItems: 'center' }}>
                <input type="checkbox" checked={guardian.is_primary} onChange={(e) => setGuardian({ ...guardian, is_primary: e.target.checked })} /> primary
              </label>
              <label className="flex gap-8" style={{ alignItems: 'center' }}>
                <input type="checkbox" checked={guardian.can_pay} onChange={(e) => setGuardian({ ...guardian, can_pay: e.target.checked })} /> can pay fees
              </label>
            </div>
          </div>
        )}
      </Card>

      <div className="flex gap-8 mt-16">
        <Button disabled={!canSubmit} onClick={submit}>{onboard.isPending ? 'Onboarding…' : 'Onboard student'}</Button>
        <Button variant="ghost" onClick={() => navigate('/students')}>Cancel</Button>
      </div>
    </div>
  );
}
