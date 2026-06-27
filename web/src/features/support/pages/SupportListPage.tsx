// Contact Support (school side) — list your tickets and open a new one. Replies from the
// platform appear in each ticket's thread once they sync down.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from '@/shared/ui';
import { type SupportTicket, useCreateTicket, useSupportTickets } from '../api/supportApi';

const STATUS_TONE: Record<SupportTicket['status'], 'primary' | 'warning' | 'success'> = {
  open: 'primary',
  pending: 'warning',
  resolved: 'success',
};

export default function SupportListPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useSupportTickets();
  const tickets = data?.tickets ?? [];
  const [showNew, setShowNew] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="flex gap-8" style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <PageHeader title="Support" subtitle="Raise a request and chat with the VED platform team." />
        <Button variant={showNew ? 'secondary' : 'primary'} onClick={() => setShowNew((v) => !v)}>
          <Icon name="user-plus" size={15} /> {showNew ? 'Close' : 'New request'}
        </Button>
      </div>

      {showNew && <NewTicketForm onDone={() => setShowNew(false)} />}

      <Card>
        <DataTable<SupportTicket>
          rows={tickets}
          rowKey={(t) => t.id}
          loading={isLoading}
          onRowClick={(t) => navigate(`/support/${t.id}`)}
          empty={
            <EmptyState
              icon={<Icon name="help" />}
              title="No requests yet"
              desc="Open a new request and our team will get back to you."
            />
          }
          columns={[
            { header: 'Subject', cell: (t) => <span style={{ fontWeight: 600 }}>{t.subject}</span> },
            { header: 'Priority', cell: (t) => t.priority },
            { header: 'Status', cell: (t) => <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge> },
            {
              header: 'Messages',
              align: 'right',
              cell: (t) => (
                <span className="flex gap-8" style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
                  <Icon name="note" size={13} /> {t.message_count}
                </span>
              ),
            },
            {
              header: 'Updated',
              align: 'right',
              cell: (t) => (
                <span className="subtle" style={{ fontSize: 13 }}>
                  {new Date(t.last_message_at).toLocaleString()}
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

function NewTicketForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const create = useCreateTicket();
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState('normal');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const valid = subject.trim() && body.trim() && !create.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const th = await create.mutateAsync({ subject: subject.trim(), priority, body: body.trim() });
      onDone();
      navigate(`/support/${th.ticket.id}`);
    } catch {
      setErr('Could not create the request. Please try again.');
    }
  }

  return (
    <Card>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 12 }}>
          <Field label="Subject">
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </Select>
          </Field>
        </div>
        <Field label="Message">
          <textarea
            className="input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe what you need help with…"
            rows={4}
            style={{ resize: 'vertical', minHeight: 96 }}
          />
        </Field>
        {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
        <div className="flex gap-8">
          <Button type="submit" disabled={!valid}>
            {create.isPending ? <Spinner /> : 'Send request'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
