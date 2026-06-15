// School / College Profile & Branding (tenant-setup). The display name, slug, and
// institution type are READ from the live tenant_profile (access slice GET). The slug is
// immutable (it drives login handles). The richer fields (address, contact, branding) are
// a designed scaffold — Save is local until the full tenant-setup write slice lands.
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Field, PageHeader, Select, Spinner } from '@/shared/ui';
import { useTenantProfile } from '../api/adminApi';

export default function ProfilePage() {
  const profile = useTenantProfile();

  const [legalName, setLegalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [institutionType, setInstitutionType] = useState('SCHOOL');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postal, setPostal] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setDisplayName(profile.data.display_name);
      setLegalName(profile.data.display_name);
      setInstitutionType(profile.data.institution_type);
    }
  }, [profile.data]);

  if (profile.isLoading) {
    return (
      <div style={{ maxWidth: 720 }}>
        <PageHeader title="School / College Profile" />
        <Card className="mt-16"><Spinner /></Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader
        title="School / College Profile & Branding"
        subtitle="Identity and contact details for this institution. The slug is permanent — it forms every login handle."
      />

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Identity</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Legal name">
            <input className="input" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Registered legal name" />
          </Field>
          <Field label="Display name" hint="Shown across the app and on documents">
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="Slug" hint="Immutable — drives login handles">
            <div className="flex gap-8" style={{ alignItems: 'center' }}>
              <input className="input" value={profile.data?.slug ?? ''} readOnly disabled style={{ flex: 1 }} />
              <Badge tone="neutral">locked</Badge>
            </div>
          </Field>
          <Field label="Institution type">
            <Select value={institutionType} onChange={(e) => setInstitutionType(e.target.value)}>
              <option value="SCHOOL">School</option>
              <option value="COLLEGE">College</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Address</h3>
        <div style={{ display: 'grid', gap: 16 }}>
          <Field label="Address line">
            <input className="input" value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="Street / building" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Field label="City">
              <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label="State / Region">
              <input className="input" value={state} onChange={(e) => setState(e.target.value)} />
            </Field>
            <Field label="Postal code">
              <input className="input" value={postal} onChange={(e) => setPostal(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Contact</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Phone">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" />
          </Field>
          <Field label="Email">
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="office@example.edu" />
          </Field>
        </div>
      </Card>

      <div className="flex gap-8 mt-16" style={{ alignItems: 'center' }}>
        <Button onClick={() => setSaved(true)}>Save profile</Button>
        {saved && <span className="subtle" style={{ fontSize: 13 }}>Saved locally — persistence ships with the tenant-setup write slice.</span>}
      </div>
    </div>
  );
}
