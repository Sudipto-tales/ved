// Holiday Calendar (tenant-setup — DESIGNED SCAFFOLD). Non-working days for the current
// academic year; attendance and timetabling skip them. Add form + table work locally;
// persistence ships with the tenant-setup write slice.
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
  Toolbar,
  type Column,
} from '@/shared/ui';

interface Holiday {
  id: string;
  date: string;
  name: string;
  type: string;
}

const TYPES = ['Public', 'Religious', 'School event', 'Vacation'];

const SEED: Holiday[] = [
  { id: 'h1', date: '2026-08-15', name: 'Independence Day', type: 'Public' },
  { id: 'h2', date: '2026-10-02', name: 'Gandhi Jayanti', type: 'Public' },
  { id: 'h3', date: '2026-12-25', name: 'Christmas', type: 'Religious' },
];

function toneFor(type: string): 'primary' | 'info' | 'success' | 'warning' | 'neutral' {
  switch (type) {
    case 'Public':
      return 'primary';
    case 'Religious':
      return 'info';
    case 'School event':
      return 'success';
    default:
      return 'warning';
  }
}

export default function HolidayCalendarPage() {
  const [holidays, setHolidays] = useState<Holiday[]>(SEED);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState(TYPES[0]);

  const sorted = useMemo(() => [...holidays].sort((a, b) => a.date.localeCompare(b.date)), [holidays]);

  function add() {
    if (!date || !name.trim()) return;
    setHolidays((prev) => [...prev, { id: `h-${Date.now()}`, date, name: name.trim(), type }]);
    setDate('');
    setName('');
    setType(TYPES[0]);
  }

  function remove(id: string) {
    setHolidays((prev) => prev.filter((h) => h.id !== id));
  }

  const columns: Column<Holiday>[] = [
    { header: 'Date', cell: (h) => <span style={{ fontWeight: 600 }}>{h.date}</span> },
    { header: 'Holiday', cell: (h) => h.name },
    { header: 'Type', cell: (h) => <Badge tone={toneFor(h.type)}>{h.type}</Badge> },
    {
      header: '',
      align: 'right',
      cell: (h) => (
        <Button variant="ghost" onClick={() => remove(h.id)}>
          Remove
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader
        title="Holiday Calendar"
        subtitle="Non-working days for the current academic year. Attendance and timetabling skip these dates."
      />

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Add holiday</h3>
        <Toolbar>
          <Field label="Date">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Founders' Day" />
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </Toolbar>
        <div className="mt-16">
          <Button disabled={!date || !name.trim()} onClick={add}>
            Add holiday
          </Button>
        </div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Holidays</h3>
        {sorted.length === 0 ? (
          <EmptyState icon={<Icon name="help" />} title="No holidays yet" desc="Add the first non-working day above." />
        ) : (
          <DataTable columns={columns} rows={sorted} rowKey={(h) => h.id} />
        )}
      </Card>
    </div>
  );
}
