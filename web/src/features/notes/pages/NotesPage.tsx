// Proves the full stack end-to-end (FE → node → Postgres+RLS → outbox), styled in the
// design system: a key-data stat, a soft input card, and a clean list with no harsh
// borders.
import { useState } from 'react';
import { Badge, Button, Card, PageHeader, Spinner, StatCard } from '@/shared/ui';
import { useNotes, useCreateNote } from '../api/notesApi';

export default function NotesPage() {
  const { data, isLoading, error } = useNotes();
  const create = useCreateNote();
  const [body, setBody] = useState('');
  const count = data?.notes.length ?? 0;

  return (
    <div style={{ maxWidth: 680 }}>
      <PageHeader
        title="Notes"
        subtitle="Walking-skeleton slice — exercises tenant context, RLS isolation, and the row + outbox + audit transaction."
        help="notes"
      />

      <div className="grid-stats">
        <StatCard label="Notes (this tenant)" value={count} accent />
        <StatCard label="Tenant isolation" value={<Badge tone="success">RLS on</Badge>} />
      </div>

      <Card className="mt-24">
        <div className="flex gap-8">
          <input
            className="input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a note…"
          />
          <Button
            disabled={!body.trim() || create.isPending}
            onClick={() => create.mutate(body.trim(), { onSuccess: () => setBody('') })}
          >
            Add note
          </Button>
        </div>
        {create.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(create.error)}</p>}
      </Card>

      <Card className="mt-16">
        {isLoading && <Spinner />}
        {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
        {!isLoading && count === 0 && <p className="muted">No notes yet for this tenant.</p>}
        {data?.notes.map((n) => (
          <div className="row" key={n.id}>
            <span>{n.body}</span>
            <span className="subtle" style={{ fontSize: 12 }}>{new Date(n.created_at).toLocaleString()}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
