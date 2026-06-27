// School registration form. Posts to the public POST /api/v1/register; on success the
// registration is in ONBOARDING and we move to the payment-proof step. The slug hint is
// a live FORMAT check (matching the server's ^[a-z][a-z0-9-]{1,30}$); true uniqueness is
// confirmed by the server (409) on submit, since there is no slug-availability endpoint.
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Field, PageHeader, Select, Spinner } from '@/shared/ui';
import { isReservedSlug } from '@/shared/tenant/reserved';
import { ApiError } from '../../shared/api';
import { usePlans, useRegister } from './api';

const SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/;

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 31);
}

export default function SignupRegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const plans = usePlans();
  const register = useRegister();

  const [schoolName, setSchoolName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugDirty, setSlugDirty] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [planId, setPlanId] = useState(params.get('plan') ?? '');
  const [error, setError] = useState<string | null>(null);

  // Auto-derive the slug from the school name until the user edits it directly.
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
  const canSubmit = schoolName && slugValid && adminName && adminEmail && planId && !register.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const reg = await register.mutateAsync({
        school_name: schoolName.trim(),
        slug: effectiveSlug,
        admin_name: adminName.trim(),
        admin_email: adminEmail.trim(),
        admin_phone: adminPhone.trim() || undefined,
        plan_id: planId,
      });
      navigate(`/signup/proof/${reg.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError('That slug or admin email is already taken. Try another.');
      else if (err instanceof ApiError && err.status === 400) setError('Please check the form — some fields are invalid.');
      else setError('Could not register. Please try again.');
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <PageHeader title="Register your school" subtitle="Create your school account. The admin login is created once you're approved." />
      <Card className="mt-16">
        {plans.isLoading ? (
          <Spinner />
        ) : (
          <form onSubmit={onSubmit}>
            <Field label="School name">
              <input className="input" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Sunrise Public School" />
            </Field>
            <Field label="URL slug" hint={slugHint}>
              <input
                className="input"
                value={effectiveSlug}
                onChange={(e) => { setSlugDirty(true); setSlug(e.target.value); }}
                placeholder="sunrise"
              />
            </Field>
            <Field label="Admin name">
              <input className="input" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Asha Rao" />
            </Field>
            <Field label="Admin email">
              <input className="input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="asha@sunrise.edu" />
            </Field>
            <Field label="Admin phone (optional)">
              <input className="input" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} placeholder="+91 98765 43210" />
            </Field>
            <Field label="Plan">
              <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
                <option value="" disabled>Select a plan…</option>
                {planList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.currency} {p.price.toLocaleString()}/{p.billing_cycle.toLowerCase()}</option>
                ))}
              </Select>
            </Field>

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
