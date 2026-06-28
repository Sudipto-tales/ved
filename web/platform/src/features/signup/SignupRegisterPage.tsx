// School registration form — DYNAMIC. The set of fields, their labels, types, options and
// required markers come from the control-plane registration-form template (the superadmin
// curates it at /registration-form). Built-in fields keep their bespoke widgets (slug
// derives from the name; plan is a live picker); custom fields render generically and post
// under `extra`. Posts to the public POST /api/v1/register.
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Field, PageHeader, Select, Spinner } from '@/shared/ui';
import { isReservedSlug } from '@/shared/tenant/reserved';
import { ApiError } from '../../shared/api';
import { usePlans, useRegister, useRegistrationForm, type RegFormField } from './api';

const SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/;

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 31);
}

function serverMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed.error === 'string') return parsed.error;
  } catch {
    /* not JSON */
  }
  return err.message || null;
}

export default function SignupRegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const plans = usePlans();
  const form = useRegistrationForm();
  const register = useRegister();

  // Dedicated state for built-in fields (they have bespoke behaviour); custom answers live
  // in `extra`, keyed by field_key.
  const [schoolName, setSchoolName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugDirty, setSlugDirty] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [businessReg, setBusinessReg] = useState('');
  const [gst, setGst] = useState('');
  const [planId, setPlanId] = useState(params.get('plan') ?? '');
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugDirty ? slug : slugify(schoolName);
  const slugReserved = isReservedSlug(effectiveSlug);
  const slugValid = SLUG_RE.test(effectiveSlug) && !slugReserved;
  const slugHint = useMemo(() => {
    if (!effectiveSlug) return 'Lowercase letters, numbers and dashes; 2–31 chars.';
    if (slugReserved) return 'That slug is reserved — please choose another.';
    if (!SLUG_RE.test(effectiveSlug)) return 'Invalid — use lowercase letters, numbers, dashes (start with a letter).';
    return `Your school will be reached at ${effectiveSlug}.ved.com`;
  }, [effectiveSlug, slugReserved]);

  const planList = plans.data?.plans ?? [];
  const fields = (form.data?.fields ?? []).slice().sort((a, b) => a.ordinal - b.ordinal);

  // Resolve the current value of any field (built-in or custom) for validation.
  const valueOf = (key: string): string => {
    switch (key) {
      case 'school_name': return schoolName;
      case 'slug': return effectiveSlug;
      case 'admin_name': return adminName;
      case 'admin_email': return adminEmail;
      case 'admin_phone': return adminPhone;
      case 'business_reg': return businessReg;
      case 'gst': return gst;
      case 'plan_id': return planId;
      default: return extra[key] ?? '';
    }
  };

  const requiredOk = fields.every((f) => !f.required || valueOf(f.field_key).trim() !== '');
  const canSubmit = slugValid && requiredOk && !register.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const customAnswers: Record<string, string> = {};
    for (const f of fields) {
      if (f.kind === 'CUSTOM') {
        const v = (extra[f.field_key] ?? '').trim();
        if (v) customAnswers[f.field_key] = v;
      }
    }
    try {
      const reg = await register.mutateAsync({
        school_name: schoolName.trim(),
        slug: effectiveSlug,
        admin_name: adminName.trim(),
        admin_email: adminEmail.trim(),
        admin_phone: adminPhone.trim() || undefined,
        plan_id: planId,
        business_reg: businessReg.trim() || undefined,
        gst: gst.trim() || undefined,
        extra: customAnswers,
      });
      navigate(`/signup/proof/${reg.id}`);
    } catch (err) {
      const msg = serverMessage(err);
      if (err instanceof ApiError && err.status === 409) setError('That slug or admin email is already taken. Try another.');
      else if (err instanceof ApiError && err.status === 400) setError(msg ?? 'Please check the form — some fields are invalid.');
      else setError('Could not register. Please try again.');
    }
  }

  function renderField(f: RegFormField) {
    const label = `${f.label}${f.required ? ' *' : ''}`;
    switch (f.field_key) {
      case 'school_name':
        return (
          <Field key={f.field_key} label={label} hint={f.help_text || undefined}>
            <input className="input" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Sunrise Public School" />
          </Field>
        );
      case 'slug':
        return (
          <Field key={f.field_key} label={label} hint={slugHint}>
            <input className="input" value={effectiveSlug} onChange={(e) => { setSlugDirty(true); setSlug(e.target.value); }} placeholder="sunrise" />
          </Field>
        );
      case 'admin_name':
        return (
          <Field key={f.field_key} label={label} hint={f.help_text || undefined}>
            <input className="input" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Asha Rao" />
          </Field>
        );
      case 'admin_email':
        return (
          <Field key={f.field_key} label={label} hint={f.help_text || undefined}>
            <input className="input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="asha@sunrise.edu" />
          </Field>
        );
      case 'admin_phone':
        return (
          <Field key={f.field_key} label={label} hint={f.help_text || undefined}>
            <input className="input" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} placeholder="+91 98765 43210" />
          </Field>
        );
      case 'business_reg':
        return (
          <Field key={f.field_key} label={label} hint={f.help_text || undefined}>
            <input className="input" value={businessReg} onChange={(e) => setBusinessReg(e.target.value)} placeholder="Registration / incorporation no." />
          </Field>
        );
      case 'gst':
        return (
          <Field key={f.field_key} label={label} hint={f.help_text || undefined}>
            <input className="input" value={gst} onChange={(e) => setGst(e.target.value)} placeholder="GST number" />
          </Field>
        );
      case 'plan_id':
        return (
          <Field key={f.field_key} label={label} hint={f.help_text || undefined}>
            <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="" disabled>Select a plan…</option>
              {planList.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.currency} {p.price.toLocaleString()}/{p.billing_cycle.toLowerCase()}</option>
              ))}
            </Select>
          </Field>
        );
      default:
        return renderCustom(f, label);
    }
  }

  function renderCustom(f: RegFormField, label: string) {
    const val = extra[f.field_key] ?? '';
    const set = (v: string) => setExtra((prev) => ({ ...prev, [f.field_key]: v }));
    if (f.field_type === 'DROPDOWN') {
      return (
        <Field key={f.field_key} label={label} hint={f.help_text || undefined}>
          <Select value={val} onChange={(e) => set(e.target.value)}>
            <option value="" disabled>Select…</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      );
    }
    const type = f.field_type === 'NUMBER' ? 'number'
      : f.field_type === 'DATE' ? 'date'
      : f.field_type === 'EMAIL' ? 'email'
      : f.field_type === 'PHONE' ? 'tel'
      : 'text';
    return (
      <Field key={f.field_key} label={label} hint={f.help_text || (f.field_type === 'FILE' ? 'Paste a link to the document.' : undefined)}>
        <input className="input" type={type} value={val} onChange={(e) => set(e.target.value)} />
      </Field>
    );
  }

  const loading = plans.isLoading || form.isLoading;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <PageHeader title="Register your school" subtitle="Create your school account. The admin login is created once you're approved." />
      <Card className="mt-16">
        {loading ? (
          <Spinner />
        ) : (
          <form onSubmit={onSubmit}>
            {fields.map(renderField)}

            {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }} role="alert">{error}</p>}

            <div className="mt-16">
              <Button type="submit" disabled={!canSubmit} style={{ width: '100%' }}>
                {register.isPending ? 'Registering…' : 'Continue to payment'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
