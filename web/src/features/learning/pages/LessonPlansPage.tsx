// Lesson plans (M8 / T3c) — DESIGNED SCAFFOLD. There is no lesson_plan table yet, so this
// is a local-only authoring surface that demonstrates the intended shape (a list of plans
// per teaching assignment + a create form). When the table lands it becomes a thin wire-up.
import { useState } from 'react';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, Toolbar } from '@/shared/ui';
import type { Column } from '@/shared/ui';

interface LessonPlan {
  id: string;
  title: string;
  objective: string;
  date: string;
}

export default function LessonPlansPage() {
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [date, setDate] = useState('');

  const add = () => {
    if (!title.trim()) return;
    setPlans((p) => [
      { id: crypto.randomUUID(), title: title.trim(), objective: objective.trim(), date },
      ...p,
    ]);
    setTitle('');
    setObjective('');
    setDate('');
  };

  const columns: Column<LessonPlan>[] = [
    { header: 'Lesson', cell: (r) => <span style={{ fontWeight: 600 }}>{r.title}</span> },
    { header: 'Objective', cell: (r) => <span className="subtle">{r.objective || '—'}</span> },
    { header: 'Date', align: 'right', cell: (r) => r.date || '—' },
  ];

  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader
        title="Lesson Plans"
        subtitle="Plan and sequence your teaching. A preview surface — plans are kept locally until the lesson-plan store ships."
      />

      <Card>
        <Toolbar>
          <span style={{ fontWeight: 600, fontSize: 15 }}>New lesson plan</span>
          <Badge tone="warning">Preview</Badge>
        </Toolbar>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <Field label="Title">
            <input className="input" placeholder="e.g. Photosynthesis — light reactions" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Learning objective" hint="What should students be able to do by the end?">
            <input className="input" placeholder="Objective" value={objective} onChange={(e) => setObjective(e.target.value)} />
          </Field>
          <div className="flex gap-8">
            <Field label="Scheduled date">
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200 }} />
            </Field>
          </div>
          <div>
            <Button disabled={!title.trim()} onClick={add}>Add plan</Button>
          </div>
        </div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Planned lessons</h3>
        {plans.length === 0 ? (
          <EmptyState
            icon={<Icon name="book" size={28} />}
            title="No lesson plans yet"
            desc="Add your first lesson above. A persistent lesson-plan store is on the roadmap."
          />
        ) : (
          <DataTable columns={columns} rows={plans} rowKey={(r) => r.id} />
        )}
      </Card>
    </div>
  );
}
