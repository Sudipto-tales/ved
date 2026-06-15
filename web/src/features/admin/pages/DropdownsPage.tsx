// Dynamic Dropdowns (tenant-setup — DESIGNED SCAFFOLD). Schools customise option lists
// (blood groups, categories, document types, …). A category Select drives an options
// table; add/remove are local until the tenant-setup write slice lands.
import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  DataTable,
  Field,
  PageHeader,
  Select,
  Toolbar,
  type Column,
} from '@/shared/ui';

type Category = 'gender' | 'blood_group' | 'category' | 'document_type' | 'religion';

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'gender', label: 'Gender' },
  { id: 'blood_group', label: 'Blood group' },
  { id: 'category', label: 'Social category' },
  { id: 'document_type', label: 'Document type' },
  { id: 'religion', label: 'Religion' },
];

const SEED: Record<Category, string[]> = {
  gender: ['Male', 'Female', 'Other', 'Prefer not to say'],
  blood_group: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
  category: ['General', 'OBC', 'SC', 'ST', 'EWS'],
  document_type: ['Birth certificate', 'Aadhaar', 'Transfer certificate', 'Passport photo'],
  religion: ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Other'],
};

interface Option {
  value: string;
}

export default function DropdownsPage() {
  const [category, setCategory] = useState<Category>('gender');
  const [lists, setLists] = useState<Record<Category, string[]>>(SEED);
  const [newOption, setNewOption] = useState('');

  const rows = useMemo<Option[]>(() => lists[category].map((value) => ({ value })), [lists, category]);

  function add() {
    const v = newOption.trim();
    if (!v) return;
    setLists((prev) => ({ ...prev, [category]: [...prev[category], v] }));
    setNewOption('');
  }

  function remove(value: string) {
    setLists((prev) => ({ ...prev, [category]: prev[category].filter((o) => o !== value) }));
  }

  const columns: Column<Option>[] = [
    { header: 'Option', cell: (o) => o.value },
    {
      header: '',
      align: 'right',
      cell: (o) => (
        <Button variant="ghost" onClick={() => remove(o.value)}>
          Remove
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader
        title="Dynamic Dropdowns"
        subtitle="Curate the option lists used across forms. Preview only — changes are local until persistence ships."
      />

      <Card className="mt-16">
        <Toolbar>
          <Field label="Option list">
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <span className="grow" />
          <Field label="Add option">
            <div className="flex gap-8">
              <input
                className="input"
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                placeholder="New value"
                onKeyDown={(e) => e.key === 'Enter' && add()}
              />
              <Button disabled={!newOption.trim()} onClick={add}>
                Add
              </Button>
            </div>
          </Field>
        </Toolbar>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>
          {CATEGORIES.find((c) => c.id === category)?.label} options
        </h3>
        <DataTable columns={columns} rows={rows} rowKey={(o) => o.value} empty="No options in this list." />
      </Card>
    </div>
  );
}
