// Onboard student (M3, Path B — direct/skip). One submit → server creates user +
// membership + profile + guardian(s) + links + outbox + audit in a single transaction
// and returns the generated login + one-time temp password, which we display ONCE for
// staff to hand over (docs/06). The wizard/approval flow layers on later.
//
// M10: the form is now governed by the tenant's dynamic onboarding template. Optional
// fields render only when the template marks them visible, carry a required (*) marker
// when configured required, use the configured label, and select inputs are populated
// from the tenant's dropdown lists. If the template/dropdowns haven't loaded yet (or a
// field is absent), we default to visible + not-required so the form is never blocked.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Field, PageHeader, Select } from '@/shared/ui';
import {
  useDropdowns,
  useOnboardingTemplate,
  type DropdownOption,
  type FieldConfig,
} from '@/features/admin/api/adminApi';
import { useOnboardStudent, type GuardianInput, type OnboardResult } from '../api/studentsApi';

const emptyGuardian: GuardianInput = {
  name: '',
  phone: '',
  email: '',
  relation: 'FATHER',
  is_primary: true,
  can_pay: true,
};

// Fallback labels for fields the template hasn't defined yet (used when no config row).
const FALLBACK_LABELS: Record<string, string> = {
  dob: 'Date of birth',
  gender: 'Gender',
  category: 'Category',
  blood_group: 'Blood group',
  address: 'Address',
  prior_school: 'Previous school',
  prior_class: 'Previous class',
  guardians: 'Guardian',
};

export default function OnboardStudentPage() {
  const onboard = useOnboardStudent();
  const navigate = useNavigate();
  const template = useOnboardingTemplate('STUDENT');
  const dropdowns = useDropdowns();

  const [name, setName] = useState('');
  const [admissionNo, setAdmissionNo] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [category, setCategory] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [address, setAddress] = useState('');
  const [priorSchool, setPriorSchool] = useState('');
  const [priorClass, setPriorClass] = useState('');
  const [addGuardian, setAddGuardian] = useState(true);
  const [guardian, setGuardian] = useState<GuardianInput>(emptyGuardian);
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // field_key → FieldConfig lookup from the tenant template.
  const configByKey = useMemo(() => {
    const m = new Map<string, FieldConfig>();
    for (const f of template.data?.fields ?? []) m.set(f.field_key, f);
    return m;
  }, [template.data]);

  // Resolve a field's config, defaulting to visible + not-required when absent or the
  // template hasn't loaded yet.
  function cfg(key: string): { label: string; visible: boolean; required: boolean } {
    const c = configByKey.get(key);
    return {
      label: c?.label || FALLBACK_LABELS[key] || key,
      visible: c ? c.visible : true,
      required: c ? c.required : false,
    };
  }

  // Active dropdown options for a category, ordered by ordinal.
  function optionsFor(category: string): DropdownOption[] {
    return (dropdowns.data?.options ?? [])
      .filter((o) => o.category === category && o.active)
      .sort((a, b) => a.ordinal - b.ordinal);
  }

  function labelWith(key: string): string {
    const c = cfg(key);
    return c.required ? `${c.label} *` : c.label;
  }

  function submit() {
    setFormError(null);

    // Client-side fail-fast: every visible + required field must have a value. The
    // backend enforces this too, but surfacing it inline avoids a round-trip.
    const checks: { key: string; value: string }[] = [
      { key: 'dob', value: dob },
      { key: 'gender', value: gender },
      { key: 'category', value: category },
      { key: 'blood_group', value: bloodGroup },
      { key: 'address', value: address },
      { key: 'prior_school', value: priorSchool },
      { key: 'prior_class', value: priorClass },
    ];
    for (const c of checks) {
      const fc = cfg(c.key);
      if (fc.visible && fc.required && !c.value.trim()) {
        setFormError(`${fc.label} is required.`);
        return;
      }
    }
    // Guardian: required by the template means a guardian must be provided + complete.
    const gCfg = cfg('guardians');
    const hasGuardian = addGuardian && guardian.name.trim() && guardian.phone.trim();
    if (gCfg.visible && gCfg.required && !hasGuardian) {
      setFormError(`${gCfg.label} (name + phone) is required.`);
      return;
    }

    const guardians = hasGuardian ? [guardian] : [];
    onboard.mutate(
      {
        name: name.trim(),
        admission_no: admissionNo.trim(),
        dob: cfg('dob').visible && dob ? dob : undefined,
        gender: cfg('gender').visible && gender ? gender : undefined,
        category: cfg('category').visible && category ? category : undefined,
        blood_group: cfg('blood_group').visible && bloodGroup ? bloodGroup : undefined,
        address: cfg('address').visible && address.trim() ? { line1: address.trim() } : undefined,
        prior_school: cfg('prior_school').visible && priorSchool.trim() ? priorSchool.trim() : undefined,
        prior_class: cfg('prior_class').visible && priorClass.trim() ? priorClass.trim() : undefined,
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
          <Button variant="ghost" onClick={() => {
            setResult(null); setName(''); setAdmissionNo(''); setDob(''); setGender('');
            setCategory(''); setBloodGroup(''); setAddress(''); setPriorSchool(''); setPriorClass('');
            setGuardian(emptyGuardian); setFormError(null);
          }}>
            Onboard another
          </Button>
          <Button variant="ghost" onClick={() => navigate('/students')}>Back to roster</Button>
        </div>
      </div>
    );
  }

  const canSubmit = name.trim() && admissionNo.trim() && !onboard.isPending;

  const showDob = cfg('dob').visible;
  const showGender = cfg('gender').visible;
  const showCategory = cfg('category').visible;
  const showBlood = cfg('blood_group').visible;
  const showAddress = cfg('address').visible;
  const showPriorSchool = cfg('prior_school').visible;
  const showPriorClass = cfg('prior_class').visible;
  const showGuardian = cfg('guardians').visible;
  const guardianRequired = cfg('guardians').required;

  return (
    <div style={{ maxWidth: 560 }}>
      <PageHeader title="Onboard student" subtitle="Creates the login, membership, admission record, and guardian links in one transaction." />

      {formError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{formError}</p>}
      {onboard.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(onboard.error)}</p>}

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Student</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <Field label="Full name *">
            <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Admission number *">
            <input className="input" placeholder="Admission number" value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} />
          </Field>

          {showDob && (
            <Field label={labelWith('dob')}>
              <input className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </Field>
          )}

          {showGender && (
            <Field label={labelWith('gender')}>
              <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Select…</option>
                {optionsFor('GENDER').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          )}

          {showCategory && (
            <Field label={labelWith('category')}>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Select…</option>
                {optionsFor('STUDENT_CATEGORY').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          )}

          {showBlood && (
            <Field label={labelWith('blood_group')}>
              <Select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)}>
                <option value="">Select…</option>
                {optionsFor('BLOOD_GROUP').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          )}

          {showAddress && (
            <Field label={labelWith('address')}>
              <input className="input" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
          )}

          {showPriorSchool && (
            <Field label={labelWith('prior_school')}>
              <input className="input" placeholder="Previous school" value={priorSchool} onChange={(e) => setPriorSchool(e.target.value)} />
            </Field>
          )}

          {showPriorClass && (
            <Field label={labelWith('prior_class')}>
              <input className="input" placeholder="Previous class" value={priorClass} onChange={(e) => setPriorClass(e.target.value)} />
            </Field>
          )}
        </div>
      </Card>

      {showGuardian && (
        <Card className="mt-16">
          <label className="flex gap-8" style={{ alignItems: 'center', fontSize: 14, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={addGuardian}
              disabled={guardianRequired}
              onChange={(e) => setAddGuardian(e.target.checked)}
            />
            {guardianRequired ? `${cfg('guardians').label} (required)` : `Add a primary ${cfg('guardians').label.toLowerCase()}`}
          </label>
          {addGuardian && (
            <div style={{ display: 'grid', gap: 10 }}>
              <input className="input" placeholder="Guardian name" value={guardian.name} onChange={(e) => setGuardian({ ...guardian, name: e.target.value })} />
              <div className="flex gap-8">
                <input className="input" placeholder="Phone" value={guardian.phone} onChange={(e) => setGuardian({ ...guardian, phone: e.target.value })} />
                <Select value={guardian.relation} onChange={(e) => setGuardian({ ...guardian, relation: e.target.value })}>
                  {optionsFor('GUARDIAN_RELATION').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
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
      )}

      <div className="flex gap-8 mt-16">
        <Button disabled={!canSubmit} onClick={submit}>{onboard.isPending ? 'Onboarding…' : 'Onboard student'}</Button>
        <Button variant="ghost" onClick={() => navigate('/students')}>Cancel</Button>
      </div>
    </div>
  );
}
