// Onboard staff (M5, direct/skip path). Returns the generated login + one-time temp
// password to hand over (docs/06).
//
// M10: the form consults the tenant's dynamic onboarding template (person type EMPLOYEE)
// so the admin's config governs which optional fields render, which are required, and the
// labels shown. Department + designation are populated from the tenant's dropdown lists.
// Unknown/unloaded fields default to visible + not-required so the form is never blocked.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Field, PageHeader, Select } from '@/shared/ui';
import {
  useDropdowns,
  useOnboardingTemplate,
  type DropdownOption,
  type FieldConfig,
} from '@/features/admin/api/adminApi';
import { useOnboardStaff, type OnboardResult } from '../api/staffApi';

const FALLBACK_LABELS: Record<string, string> = {
  department: 'Department',
  designation: 'Designation',
  employee_code: 'Employee code',
  joining_date: 'Joining date',
};

export default function OnboardStaffPage() {
  const onboard = useOnboardStaff();
  const navigate = useNavigate();
  const template = useOnboardingTemplate('EMPLOYEE');
  const dropdowns = useDropdowns();

  const [name, setName] = useState('');
  const [dept, setDept] = useState('');
  const [desig, setDesig] = useState('');
  const [code, setCode] = useState('');
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
  function optionsFor(category: string): DropdownOption[] {
    return (dropdowns.data?.options ?? [])
      .filter((o) => o.category === category && o.active)
      .sort((a, b) => a.ordinal - b.ordinal);
  }

  function submit() {
    setFormError(null);
    const checks: { key: string; value: string }[] = [
      { key: 'department', value: dept },
      { key: 'designation', value: desig },
      { key: 'employee_code', value: code },
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
        department: cfg('department').visible && dept ? dept : undefined,
        designation: cfg('designation').visible && desig ? desig : undefined,
        employee_code: cfg('employee_code').visible && code ? code : undefined,
        joining_date: cfg('joining_date').visible && joining ? joining : undefined,
      },
      { onSuccess: (r) => setResult(r) },
    );
  }

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
          <Button variant="ghost" onClick={() => { setResult(null); setName(''); setDept(''); setDesig(''); setCode(''); setJoining(''); setFormError(null); }}>Onboard another</Button>
          <Button variant="ghost" onClick={() => navigate('/staff')}>Back to roster</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <PageHeader title="Onboard staff" subtitle="Creates the login, membership, and staff profile in one transaction." />
      {formError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{formError}</p>}
      {onboard.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(onboard.error)}</p>}
      <Card className="mt-16">
        <div style={{ display: 'grid', gap: 10 }}>
          <Field label="Full name *">
            <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {cfg('department').visible && (
            <Field label={labelWith('department')}>
              <Select value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="">Select…</option>
                {optionsFor('DEPARTMENT').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          )}
          {cfg('designation').visible && (
            <Field label={labelWith('designation')}>
              <Select value={desig} onChange={(e) => setDesig(e.target.value)}>
                <option value="">Select…</option>
                {optionsFor('DESIGNATION').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          )}
          {cfg('employee_code').visible && (
            <Field label={labelWith('employee_code')}>
              <input className="input" placeholder="Employee code" value={code} onChange={(e) => setCode(e.target.value)} />
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
          {onboard.isPending ? 'Onboarding…' : 'Onboard staff'}
        </Button>
        <Button variant="ghost" onClick={() => navigate('/staff')}>Cancel</Button>
      </div>
    </div>
  );
}
