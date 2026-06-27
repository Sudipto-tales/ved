// Dynamic Dropdowns (tenant-setup — M10, live). Schools curate the option lists used
// across onboarding forms (gender, blood group, category, …). Options are grouped by
// category; each category renders as a Card with a small table. Add/remove are wired to
// the access slice (useUpsertDropdown / useDeleteDropdown), persisted server-side.
import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  Select,
  Spinner,
  Toolbar,
  type Column,
} from '@/shared/ui';
import {
  useDeleteDropdown,
  useDropdowns,
  useUpsertDropdown,
  type DropdownOption,
} from '../api/adminApi';

const KNOWN_CATEGORIES = [
  'GENDER',
  'BLOOD_GROUP',
  'STUDENT_CATEGORY',
  'GUARDIAN_RELATION',
  'DEPARTMENT',
  'DESIGNATION',
];

export default function DropdownsPage() {
  const dropdowns = useDropdowns();
  const upsert = useUpsertDropdown();
  const del = useDeleteDropdown();

  const [category, setCategory] = useState(KNOWN_CATEGORIES[0]);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');

  const grouped = useMemo(() => {
    const map = new Map<string, DropdownOption[]>();
    for (const o of dropdowns.data?.options ?? []) {
      const list = map.get(o.category) ?? [];
      list.push(o);
      map.set(o.category, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [dropdowns.data]);

  function add() {
    const cat = category.trim().toUpperCase();
    const lab = label.trim();
    const val = value.trim();
    if (!cat || !lab || !val) return;
    upsert.mutate(
      { category: cat, label: lab, value: val, active: true },
      {
        onSuccess: () => {
          setLabel('');
          setValue('');
        },
      },
    );
  }

  const columns: Column<DropdownOption>[] = [
    { header: 'Label', cell: (o) => o.label },
    { header: 'Value', cell: (o) => <span className="subtle" style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.value}</span> },
    {
      header: 'Status',
      cell: (o) => <Badge tone={o.active ? 'success' : 'neutral'}>{o.active ? 'active' : 'inactive'}</Badge>,
    },
    {
      header: '',
      align: 'right',
      cell: (o) => (
        <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="icon-btn"
            title="Delete"
            aria-label="Delete"
            disabled={del.isPending}
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Delete option "${o.label}"?`)) del.mutate(o.id);
            }}
          >
            <Icon name="trash" />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader
        title="Dynamic Dropdowns"
        subtitle="Curate the option lists used across onboarding forms — gender, blood group, category, and more."
      />

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Add option</h3>
        <Toolbar>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {KNOWN_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Label">
            <input
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Shown to users"
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
          </Field>
          <Field label="Value">
            <input
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Stored value"
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
          </Field>
          <span className="grow" />
          <Field label="&nbsp;">
            <Button disabled={!label.trim() || !value.trim() || upsert.isPending} onClick={add}>
              {upsert.isPending ? 'Adding…' : 'Add option'}
            </Button>
          </Field>
        </Toolbar>
      </Card>

      {dropdowns.isLoading ? (
        <Card className="mt-16"><Spinner /></Card>
      ) : grouped.length === 0 ? (
        <Card className="mt-16">
          <EmptyState
            icon={<Icon name="settings" />}
            title="No option lists yet"
            desc="Add your first dropdown option above to get started."
          />
        </Card>
      ) : (
        grouped.map(([cat, options]) => (
          <Card key={cat} className="mt-16">
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>{cat}</h3>
            <DataTable
              columns={columns}
              rows={options}
              rowKey={(o) => o.id}
              empty="No options in this list."
              searchable
              searchText={(o) => `${o.category} ${o.label} ${o.value}`}
            />
          </Card>
        ))
      )}
    </div>
  );
}
