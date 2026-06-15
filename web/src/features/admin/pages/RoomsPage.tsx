// Rooms (tenant-setup — DESIGNED SCAFFOLD). Physical spaces used for timetabling and
// exams. Add form + table work locally; persistence ships with the tenant-setup write slice.
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  PageHeader,
  Select,
  Toolbar,
  type Column,
} from '@/shared/ui';

interface Room {
  id: string;
  name: string;
  code: string;
  type: string;
  capacity: number;
}

const ROOM_TYPES = ['Classroom', 'Laboratory', 'Hall', 'Library', 'Office'];

const SEED: Room[] = [
  { id: 'r1', name: 'Room 101', code: 'R-101', type: 'Classroom', capacity: 40 },
  { id: 'r2', name: 'Physics Lab', code: 'LAB-PHY', type: 'Laboratory', capacity: 30 },
  { id: 'r3', name: 'Main Hall', code: 'HALL-1', type: 'Hall', capacity: 250 },
];

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>(SEED);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState(ROOM_TYPES[0]);
  const [capacity, setCapacity] = useState('');

  function add() {
    if (!name.trim() || !code.trim()) return;
    setRooms((prev) => [
      ...prev,
      { id: `r-${Date.now()}`, name: name.trim(), code: code.trim(), type, capacity: Number(capacity) || 0 },
    ]);
    setName('');
    setCode('');
    setCapacity('');
    setType(ROOM_TYPES[0]);
  }

  const columns: Column<Room>[] = [
    { header: 'Room', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { header: 'Code', cell: (r) => <span className="subtle">{r.code}</span> },
    { header: 'Type', cell: (r) => <Badge tone="neutral">{r.type}</Badge> },
    { header: 'Capacity', align: 'right', cell: (r) => r.capacity },
  ];

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader
        title="Rooms"
        subtitle="Physical spaces for timetabling and exam seating. Preview only — changes are local."
      />

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Add room</h3>
        <Toolbar>
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Room 102" />
          </Field>
          <Field label="Code">
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="R-102" />
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {ROOM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Capacity">
            <input className="input" type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="40" style={{ width: 100 }} />
          </Field>
        </Toolbar>
        <div className="mt-16">
          <Button disabled={!name.trim() || !code.trim()} onClick={add}>
            Add room
          </Button>
        </div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Rooms</h3>
        <DataTable columns={columns} rows={rooms} rowKey={(r) => r.id} empty="No rooms yet." />
      </Card>
    </div>
  );
}
