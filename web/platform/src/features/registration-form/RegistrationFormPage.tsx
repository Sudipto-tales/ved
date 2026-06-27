// Registration Form editor (control plane). The superadmin curates the public /signup form:
// toggle/relabel/reorder the built-in fields and add custom fields (text/number/date/
// dropdown/file). Saving PUTs the whole template (server upserts + one cp_audit_log row).
//
// Locked built-ins (school_name, slug, admin_name, admin_email, plan_id) are structurally
// required — they can be relabelled and reordered but never hidden, un-required, or deleted.
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Field, Icon, PageHeader, Select, SectionCard, Spinner } from '@/shared/ui';
import {
  useRegistrationFormConfig,
  useSaveRegistrationForm,
  type RegField,
  type RegFieldOption,
} from '../../shared/platformApi';

const FIELD_TYPES: RegField['field_type'][] = ['TEXT', 'NUMBER', 'DATE', 'EMAIL', 'PHONE', 'DROPDOWN', 'FILE'];
const KEY_RE = /^[a-z][a-z0-9_]{1,40}$/;

function slugifyKey(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 41);
}

export default function RegistrationFormPage() {
  const { data, isLoading } = useRegistrationFormConfig();
  const save = useSaveRegistrationForm();

  const [fields, setFields] = useState<RegField[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Sync local edit state when the server template (re)loads.
  useEffect(() => {
    if (data) setFields(data.fields.slice().sort((a, b) => a.ordinal - b.ordinal));
  }, [data]);

  const patch = (idx: number, p: Partial<RegField>) =>
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...p } : f)));

  const move = (idx: number, dir: -1 | 1) =>
    setFields((prev) => {
      const next = prev.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

  const remove = (idx: number) => setFields((prev) => prev.filter((_, i) => i !== idx));

  function onSave() {
    setErr(null);
    // Reassign ordinals from display order before persisting.
    save.mutate(
      fields.map((f, i) => ({ ...f, ordinal: i * 10 })),
      { onError: (e) => setErr(String(e instanceof Error ? e.message : e)) },
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Registration Form"
        subtitle="Choose what a school must submit at sign-up. Toggle and relabel the built-in fields, or add your own."
      />

      {isLoading && <Spinner />}

      {!isLoading && (
        <>
          <SectionCard icon="note" title="Form fields" subtitle="Shown on the public signup page, in this order." tone="violet">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {fields.map((f, idx) => (
                <FieldRow
                  key={f.field_key}
                  field={f}
                  first={idx === 0}
                  last={idx === fields.length - 1}
                  onChange={(p) => patch(idx, p)}
                  onMove={(d) => move(idx, d)}
                  onRemove={() => remove(idx)}
                />
              ))}
            </div>
          </SectionCard>

          {addOpen ? (
            <AddCustomField
              existingKeys={fields.map((f) => f.field_key)}
              onCancel={() => setAddOpen(false)}
              onAdd={(nf) => {
                setFields((prev) => [...prev, nf]);
                setAddOpen(false);
              }}
            />
          ) : (
            <div>
              <Button variant="ghost" onClick={() => setAddOpen(true)}>
                <Icon name="user-plus" size={15} /> Add custom field
              </Button>
            </div>
          )}

          {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}

          <div className="flex gap-8">
            <Button disabled={save.isPending} onClick={onSave}>
              {save.isPending ? 'Saving…' : 'Save form'}
            </Button>
            {save.isSuccess && !save.isPending && <span className="subtle" style={{ alignSelf: 'center', fontSize: 13 }}>Saved.</span>}
          </div>
        </>
      )}
    </div>
  );
}

function FieldRow({
  field: f,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  field: RegField;
  first: boolean;
  last: boolean;
  onChange: (p: Partial<RegField>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <Card>
      <div className="flex gap-8" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="flex gap-8" style={{ alignItems: 'center' }}>
          <code style={{ fontSize: 12 }}>{f.field_key}</code>
          <Badge tone={f.kind === 'BUILTIN' ? 'neutral' : 'info'}>{f.kind === 'BUILTIN' ? 'built-in' : 'custom'}</Badge>
          <span className="subtle" style={{ fontSize: 12 }}>{f.field_type}</span>
          {f.locked && <Badge tone="warning">required</Badge>}
        </div>
        <div className="flex gap-8" style={{ alignItems: 'center' }}>
          <button className="icon-btn" title="Move up" disabled={first} onClick={() => onMove(-1)}><Icon name="arrow-left" size={15} style={{ transform: 'rotate(90deg)' }} /></button>
          <button className="icon-btn" title="Move down" disabled={last} onClick={() => onMove(1)}><Icon name="arrow-left" size={15} style={{ transform: 'rotate(-90deg)' }} /></button>
          {f.kind === 'CUSTOM' && (
            <button className="icon-btn" title="Remove field" onClick={onRemove}><Icon name="trash" size={15} /></button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <Field label="Label">
          <input className="input" value={f.label} onChange={(e) => onChange({ label: e.target.value })} />
        </Field>
        <Field label="Help text (optional)">
          <input className="input" value={f.help_text} onChange={(e) => onChange({ help_text: e.target.value })} />
        </Field>
      </div>

      <div className="flex gap-8" style={{ marginTop: 10, gap: 20 }}>
        <label className="flex gap-8" style={{ alignItems: 'center', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={f.visible}
            disabled={f.locked}
            onChange={(e) => onChange({ visible: e.target.checked, required: e.target.checked ? f.required : false })}
          />
          Visible
        </label>
        <label className="flex gap-8" style={{ alignItems: 'center', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={f.required}
            disabled={f.locked || !f.visible}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Required
        </label>
      </div>

      {f.field_type === 'DROPDOWN' && f.kind === 'CUSTOM' && (
        <div style={{ marginTop: 12 }}>
          <OptionsEditor options={f.options} onChange={(options) => onChange({ options })} />
        </div>
      )}
    </Card>
  );
}

function OptionsEditor({ options, onChange }: { options: RegFieldOption[]; onChange: (o: RegFieldOption[]) => void }) {
  const set = (i: number, p: Partial<RegFieldOption>) => onChange(options.map((o, j) => (j === i ? { ...o, ...p } : o)));
  return (
    <div>
      <span className="muted" style={{ fontSize: 12 }}>Dropdown options</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        {options.map((o, i) => (
          <div key={i} className="flex gap-8" style={{ alignItems: 'center' }}>
            <input className="input" placeholder="Label" value={o.label} onChange={(e) => set(i, { label: e.target.value })} />
            <input className="input" placeholder="value" value={o.value} onChange={(e) => set(i, { value: e.target.value })} />
            <button className="icon-btn" title="Remove option" onClick={() => onChange(options.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
          </div>
        ))}
      </div>
      <Button variant="ghost" onClick={() => onChange([...options, { label: '', value: '' }])} style={{ marginTop: 6 }}>
        Add option
      </Button>
    </div>
  );
}

function AddCustomField({
  existingKeys,
  onAdd,
  onCancel,
}: {
  existingKeys: string[];
  onAdd: (f: RegField) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState('');
  const [keyDirty, setKeyDirty] = useState(false);
  const [key, setKey] = useState('');
  const [type, setType] = useState<RegField['field_type']>('TEXT');
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState<RegFieldOption[]>([{ label: '', value: '' }]);
  const [err, setErr] = useState<string | null>(null);

  const effKey = keyDirty ? key : slugifyKey(label);

  function add() {
    setErr(null);
    if (!label.trim()) return setErr('A label is required.');
    if (!KEY_RE.test(effKey)) return setErr('Key must be a slug: lowercase letters, numbers, underscores (start with a letter).');
    if (existingKeys.includes(effKey)) return setErr(`The key "${effKey}" is already in use.`);
    const opts = options.filter((o) => o.label.trim() && o.value.trim());
    if (type === 'DROPDOWN' && opts.length === 0) return setErr('A dropdown needs at least one option.');
    onAdd({
      field_key: effKey,
      kind: 'CUSTOM',
      field_type: type,
      label: label.trim(),
      help_text: '',
      visible: true,
      required,
      locked: false,
      ordinal: 9999,
      options: type === 'DROPDOWN' ? opts : [],
    });
  }

  return (
    <SectionCard icon="user-plus" title="New custom field" tone="info">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Label">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Board affiliation" />
        </Field>
        <Field label="Key" hint="Stored in extra_fields; auto-derived from the label.">
          <input className="input" value={effKey} onChange={(e) => { setKeyDirty(true); setKey(e.target.value); }} placeholder="board_affiliation" />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as RegField['field_type'])}>
            {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Required">
          <label className="flex gap-8" style={{ alignItems: 'center', fontSize: 13, height: 38 }}>
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Make this field required
          </label>
        </Field>
      </div>

      {type === 'DROPDOWN' && (
        <div style={{ marginTop: 8 }}>
          <OptionsEditor options={options} onChange={setOptions} />
        </div>
      )}

      {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{err}</p>}

      <div className="flex gap-8 mt-16">
        <Button onClick={add}>Add field</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </SectionCard>
  );
}
