// Onboarding Forms (tenant-setup — M10, live). Admins choose which fields each onboarding
// form (Student / Teacher / Staff) collects, and which of the visible ones are required.
// The template is fetched per person type and edited in local state, then saved back via
// the access slice (useSaveOnboardingTemplate). Core identity fields (name, admission no)
// are always required and never listed here.
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  PageHeader,
  Spinner,
  Tabs,
  type Column,
} from '@/shared/ui';
import {
  useOnboardingTemplate,
  useSaveOnboardingTemplate,
  type FieldConfig,
  type PersonType,
} from '../api/adminApi';

const TABS: { id: PersonType; label: string }[] = [
  { id: 'STUDENT', label: 'Student' },
  { id: 'TEACHER', label: 'Teacher' },
  { id: 'EMPLOYEE', label: 'Staff' },
];

export default function OnboardingFormsPage() {
  const [type, setType] = useState<PersonType>('STUDENT');
  const template = useOnboardingTemplate(type);
  const save = useSaveOnboardingTemplate();

  const [fields, setFields] = useState<FieldConfig[]>([]);

  // Re-seed local editable state whenever the active tab changes or fresh data loads.
  useEffect(() => {
    if (template.data) {
      setFields(template.data.fields.map((f) => ({ ...f })));
    }
  }, [template.data, type]);

  function patch(field_key: string, change: Partial<FieldConfig>) {
    setFields((prev) =>
      prev.map((f) => (f.field_key === field_key ? { ...f, ...change } : f)),
    );
  }

  const columns: Column<FieldConfig>[] = [
    {
      header: 'Field',
      cell: (f) => (
        <div>
          <div>{f.label || f.field_key}</div>
          <div className="subtle" style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.field_key}</div>
        </div>
      ),
    },
    {
      header: 'Label',
      cell: (f) => (
        <input
          className="input"
          value={f.label}
          onChange={(e) => patch(f.field_key, { label: e.target.value })}
          placeholder={f.field_key}
        />
      ),
    },
    {
      header: 'Visible',
      align: 'right',
      cell: (f) => (
        <input
          type="checkbox"
          checked={f.visible}
          onChange={(e) =>
            patch(f.field_key, {
              visible: e.target.checked,
              // required only applies to visible fields
              required: e.target.checked ? f.required : false,
            })
          }
        />
      ),
    },
    {
      header: 'Required',
      align: 'right',
      cell: (f) => (
        <input
          type="checkbox"
          checked={f.required}
          disabled={!f.visible}
          onChange={(e) => patch(f.field_key, { required: e.target.checked })}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Onboarding Forms"
        subtitle="Choose which fields each onboarding form collects"
      />

      <Card className="mt-16">
        <Tabs tabs={TABS} active={type} onChange={setType} />

        <p className="subtle" style={{ fontSize: 13, margin: '12px 0 4px' }}>
          Required only applies to visible fields. Core identity fields (name, admission no)
          are always required and are not listed here.
        </p>

        {template.isLoading ? (
          <div className="mt-16"><Spinner /></div>
        ) : (
          <DataTable
            columns={columns}
            rows={fields}
            rowKey={(f) => f.field_key}
            empty="No configurable fields for this form."
          />
        )}

        <div className="flex gap-8 mt-16" style={{ alignItems: 'center' }}>
          <Button
            disabled={save.isPending || template.isLoading}
            onClick={() => save.mutate({ personType: type, fields })}
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          {save.isSuccess && !save.isPending && <Badge tone="success">Saved</Badge>}
        </div>
      </Card>
    </div>
  );
}
