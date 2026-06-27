// Onboard teacher (M5, direct/skip path). One submit → identity + profile in one tx;
// returns the generated login + one-time temp password to hand over (docs/06).
//
// M10: the form consults the tenant's dynamic onboarding template (person type TEACHER)
// so the admin's config governs which optional fields render, which are required, and the
// labels shown. Unknown/unloaded fields default to visible + not-required so the form is
// never blocked.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Field, PageHeader } from '@/shared/ui';
import { useOnboardingTemplate, type FieldConfig } from '@/features/admin/api/adminApi';
import { useOnboardTeacher, type OnboardResult } from '../api/teachersApi';

const FALLBACK_LABELS: Record<string, string> = {
  employee_code: 'Employee code',
  specialization: 'Specialization',
  qualifications: 'Qualifications',
  joining_date: 'Joining date',
};

export default function OnboardTeacherPage() {
  const onboard = useOnboardTeacher();
  const navigate = useNavigate();
  const template = useOnboardingTemplate('TEACHER');

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [spec, setSpec] = useState('');
  const [quals, setQuals] = useState('');
  const [joining, setJoining] = useState('');
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const configByKey = useMemo(() => {
    const m = new Map<string, FieldConfig>();
    for (const f of template.data?.fields ?? []) m.set(f.field_key, f);
    return m;
  }, [template.data]);

  function cfg(key: string): { label: string; visible: boolean; required: boolean } {
    const c = configByKey.get(key);
    return {
      label: c?.label || FALLBACK_LABELS[key] || key,
      visible: c ? c.visible : true,
      required: c ? c.required : false,
    };
  }
  function labelWith(key: string): string {
    const c = cfg(key);
    return c.required ? `${c.label} *` : c.label;
  }

  function submit() {
    setFormError(null);
    const checks: { key: string; value: string }[] = [
      { key: 'employee_code', value: code },
      { key: 'specialization', value: spec },
      { key: 'qualifications', value: quals },
      { key: 'joining_date', value: joining },
    ];
    for (const c of checks) {
      const fc = cfg(c.key);
      if (fc.visible && fc.required && !c.value.trim()) {
        setFormError(`${fc.label} is required.`);
        return;
      }
    }
    onboard.mutate(
      {
        name: name.trim(),
        employee_code: cfg('employee_code').visible && code ? code : undefined,
        specialization: cfg('specialization').visible && spec ? spec : undefined,
        qualifications: cfg('qualifications').visible && quals.trim() ? { summary: quals.trim() } : undefined,
        joining_date: cfg('joining_date').visible && joining ? joining : undefined,
      },
      { onSuccess: (r) => setResult(r) },
    );
  }

  if (result) {
    return (
      <div>
        <PageHeader title="Teacher onboarded" subtitle="Hand these credentials over. The password is shown once and must be reset on first login." />
        <Card className="mt-16">
          <div className="row"><span className="muted">Login</span><code>{result.login_identifier}</code></div>
          <div className="row"><span className="muted">Temporary password</span><code>{result.temp_password}</code></div>
          <div className="row"><span className="muted">Status</span><Badge tone="success">must reset on first login</Badge></div>
        </Card>
        <div className="flex gap-8 mt-16">
          <Link to={`/teachers/${result.teacher_id}`}><Button>View teacher</Button></Link>
          <Button variant="ghost" onClick={() => { setResult(null); setName(''); setCode(''); setSpec(''); setQuals(''); setJoining(''); setFormError(null); }}>Onboard another</Button>
          <Button variant="ghost" onClick={() => navigate('/teachers')}>Back to roster</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Onboard teacher" subtitle="Creates the login, membership, and teaching profile in one transaction." />
      {formError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{formError}</p>}
      {onboard.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(onboard.error)}</p>}
      <Card className="mt-16">
        <div style={{ display: 'grid', gap: 10 }}>
          <Field label="Full name *">
            <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {cfg('employee_code').visible && (
            <Field label={labelWith('employee_code')}>
              <input className="input" placeholder="Employee code" value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
          )}
          {cfg('specialization').visible && (
            <Field label={labelWith('specialization')}>
              <input className="input" placeholder="Specialization" value={spec} onChange={(e) => setSpec(e.target.value)} />
            </Field>
          )}
          {cfg('qualifications').visible && (
            <Field label={labelWith('qualifications')}>
              <input className="input" placeholder="Qualifications (degrees, certifications)" value={quals} onChange={(e) => setQuals(e.target.value)} />
            </Field>
          )}
          {cfg('joining_date').visible && (
            <Field label={labelWith('joining_date')}>
              <input className="input" type="date" value={joining} onChange={(e) => setJoining(e.target.value)} />
            </Field>
          )}
        </div>
      </Card>
      <div className="flex gap-8 mt-16">
        <Button disabled={!name.trim() || onboard.isPending} onClick={submit}>
          {onboard.isPending ? 'Onboarding…' : 'Onboard teacher'}
        </Button>
        <Button variant="ghost" onClick={() => navigate('/teachers')}>Cancel</Button>
      </div>
    </div>
  );
}
