// Settings — platform super-admin configuration & credentials. The settings store is a
// free-form key → JSON map (GET/PUT /api/v1/platform/settings). This page edits a handful
// of KNOWN keys, each held as a small object, behind collapsible cards. Each card keeps its
// own editable string-field state seeded from settings[key], and a Save button PUTs just
// that key ({ [key]: edited }) — the server merges per key.
import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Collapsible,
  Field,
  PageHeader,
  Spinner,
  type CardTone,
  type IconName,
} from '@/shared/ui';
import { useSaveSettings, useSettings, type Settings } from '../../shared/platformApi';

// A single editable field within a card.
interface FieldSpec {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'password';
  hint?: string;
}

// A card = one settings key holding an object of string fields.
interface CardSpec {
  settingsKey: string;
  icon: IconName;
  title: string;
  subtitle: string;
  tone: CardTone;
  defaultOpen?: boolean;
  fields: FieldSpec[];
}

const CARDS: CardSpec[] = [
  {
    settingsKey: 'endpoints',
    icon: 'globe',
    title: 'API & Endpoints',
    subtitle: 'Node, control-plane & public site URLs',
    tone: 'violet',
    defaultOpen: true,
    fields: [
      { key: 'node_url', label: 'Node URL', placeholder: 'http://localhost:8091' },
      { key: 'control_plane_url', label: 'Control-plane URL', placeholder: 'https://platform.ved.test' },
      { key: 'public_site_url', label: 'Public site URL', placeholder: 'https://ved.test' },
    ],
  },
  {
    settingsKey: 'security',
    icon: 'shield',
    title: 'Security & Signing',
    subtitle: 'License signing key & platform JWT secret',
    tone: 'danger',
    fields: [
      { key: 'license_signing_key', label: 'License signing key', type: 'password', hint: 'Stored server-side; overwrite to rotate' },
      { key: 'platform_jwt_secret', label: 'Platform JWT secret', type: 'password', hint: 'Stored server-side; overwrite to rotate' },
    ],
  },
  {
    settingsKey: 'smtp',
    icon: 'bell',
    title: 'Email (SMTP)',
    subtitle: 'Outbound mail server credentials',
    tone: 'info',
    fields: [
      { key: 'host', label: 'Host', placeholder: 'smtp.example.com' },
      { key: 'port', label: 'Port', placeholder: '587' },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password', type: 'password' },
      { key: 'from_address', label: 'From address', placeholder: 'no-reply@ved.test' },
    ],
  },
  {
    settingsKey: 'payments',
    icon: 'wallet',
    title: 'Payments',
    subtitle: 'Payment gateway keys & webhook secret',
    tone: 'success',
    fields: [
      { key: 'gateway', label: 'Gateway', placeholder: 'razorpay' },
      { key: 'api_key', label: 'API key', type: 'password' },
      { key: 'webhook_secret', label: 'Webhook secret', type: 'password' },
    ],
  },
  {
    settingsKey: 'publishing',
    icon: 'settings',
    title: 'App Store / Publishing',
    subtitle: 'Signing identities used by the App Releases page',
    tone: 'warning',
    fields: [
      { key: 'apple_team_id', label: 'Apple Team ID' },
      { key: 'app_store_key_id', label: 'App Store Key ID' },
      { key: 'google_play_account', label: 'Google Play account' },
      { key: 'signing_cert', label: 'Signing certificate', hint: 'Path or identifier of the signing cert' },
    ],
  },
  {
    settingsKey: 'branding',
    icon: 'building',
    title: 'Branding',
    subtitle: 'Product name, support contact & accent color',
    tone: 'primary',
    fields: [
      { key: 'product_name', label: 'Product name', placeholder: 'VED' },
      { key: 'support_email', label: 'Support email', placeholder: 'support@ved.test' },
      { key: 'primary_color', label: 'Primary color', placeholder: '#00a76f' },
    ],
  },
];

// Mutable string-field state for a card.
type CardState = Record<string, string>;

// Seed a card's editable state from settings[key], coercing each known field to a string.
function seedCard(spec: CardSpec, settings: Settings | undefined): CardState {
  const raw = (settings?.[spec.settingsKey] ?? {}) as Record<string, unknown>;
  const out: CardState = {};
  for (const f of spec.fields) {
    const v = raw[f.key];
    out[f.key] = v == null ? '' : String(v);
  }
  return out;
}

// LabeledInput — a generic Field + auto-styled input bound to one key of a card's state.
function LabeledInput({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Field label={field.label} hint={field.hint}>
      <input
        className="input"
        type={field.type ?? 'text'}
        value={value}
        placeholder={field.placeholder}
        autoComplete={field.type === 'password' ? 'new-password' : 'off'}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function SettingsCard({ spec, settings }: { spec: CardSpec; settings: Settings | undefined }) {
  const save = useSaveSettings();
  const seeded = useMemo(() => seedCard(spec, settings), [spec, settings]);
  const [state, setState] = useState<CardState>(seeded);

  // Re-seed when the server payload changes (e.g. after a successful save/refetch).
  useEffect(() => {
    setState(seeded);
  }, [seeded]);

  function patch(key: string, next: string) {
    setState((s) => ({ ...s, [key]: next }));
  }

  function onSave() {
    save.mutate({ [spec.settingsKey]: state });
  }

  return (
    <Collapsible
      icon={spec.icon}
      title={spec.title}
      subtitle={spec.subtitle}
      tone={spec.tone}
      defaultOpen={spec.defaultOpen}
      right={save.isSuccess ? <Badge tone="success">Saved</Badge> : undefined}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {spec.fields.map((f) => (
          <LabeledInput key={f.key} field={f} value={state[f.key] ?? ''} onChange={(next) => patch(f.key, next)} />
        ))}
      </div>
      {save.error && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{String(save.error)}</p>}
      <div className="flex gap-8 mt-16" style={{ alignItems: 'center' }}>
        <Button disabled={save.isPending} onClick={onSave}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        {save.isSuccess && <Badge tone="success">Saved</Badge>}
      </div>
    </Collapsible>
  );
}

export default function SettingsPage() {
  const { data, isLoading, error } = useSettings();
  const settings = data?.settings;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title="Settings" subtitle="Platform configuration & credentials" />
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
        Credentials are stored in the control-plane settings store.
      </p>
      {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
      {isLoading ? (
        <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : (
        CARDS.map((spec) => <SettingsCard key={spec.settingsKey} spec={spec} settings={settings} />)
      )}
    </div>
  );
}
