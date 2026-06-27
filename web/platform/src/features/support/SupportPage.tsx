// Support Console — the live ticket queue. Lists tickets (filter by status), opens one
// in the detail view (full thread + reply), and lets the superadmin log a ticket on a
// school's behalf. Backed by control_plane.support_* (platform_support.go).
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
  StatCard,
  Tabs,
} from '@/shared/ui';
import {
  type SupportTicket,
  useCreateTicket,
  useSupportAnalytics,
  useSupportTickets,
} from '../../shared/platformApi';

const PRIORITY_TONE: Record<SupportTicket['priority'], 'warning' | 'neutral' | 'info'> = {
  high: 'warning',
  normal: 'neutral',
  low: 'info',
};
const STATUS_TONE: Record<SupportTicket['status'], 'primary' | 'warning' | 'success'> = {
  open: 'primary',
  pending: 'warning',
  resolved: 'success',
};

export default function SupportPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'open' | 'all'>('open');
  const status = tab === 'open' ? 'open' : 'all';

  const { data: analytics } = useSupportAnalytics();
  const { data, isLoading } = useSupportTickets(status);
  const tickets = data?.tickets ?? [];

  const [showNew, setShowNew] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title="Support Console" subtitle="Triage and reply to school support requests across the network." />

      <div className="grid-stats">
        <StatCard label="Open" value={analytics?.open ?? 0} tone="primary" icon="help" />
        <StatCard label="Pending" value={analytics?.pending ?? 0} tone="warning" icon="bell" />
        <StatCard label="Resolved" value={analytics?.resolved ?? 0} tone="success" icon="check" />
        <StatCard
          label="Total"
          value={(analytics?.open ?? 0) + (analytics?.pending ?? 0) + (analytics?.resolved ?? 0)}
          tone="info"
          icon="chart"
        />
      </div>

      <div className="toolbar">
        <Tabs<'open' | 'all'>
          tabs={[
            { id: 'open', label: 'Open' },
            { id: 'all', label: 'All' },
          ]}
          active={tab}
          onChange={setTab}
        />
        <span className="grow" style={{ flex: 1 }} />
        <Button variant={showNew ? 'secondary' : 'primary'} onClick={() => setShowNew((v) => !v)}>
          <Icon name="user-plus" size={15} /> {showNew ? 'Close' : 'New ticket'}
        </Button>
      </div>

      {showNew && <NewTicketForm onDone={() => setShowNew(false)} />}

      <Card>
        <DataTable<SupportTicket>
          rows={tickets}
          rowKey={(t) => t.id}
          loading={isLoading}
          onRowClick={(t) => navigate(`/support/${t.id}`)}
          empty={<EmptyState icon={<Icon name="help" />} title="No tickets" desc="Nothing in this queue." />}
          searchable
          searchText={(t) => `${t.school_name} ${t.subject} ${t.status}`}
          searchPlaceholder="Search tickets…"
          columns={[
            { header: 'School', cell: (t) => <span style={{ fontWeight: 600 }}>{t.school_name || '—'}</span> },
            { header: 'Subject', cell: (t) => t.subject },
            { header: 'Priority', cell: (t) => <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge> },
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
  const create = useCreateTicket();
  const [school, setSchool] = useState('');
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState('normal');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const valid = subject.trim() && body.trim() && !create.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const th = await create.mutateAsync({ school_name: school.trim(), subject: subject.trim(), priority, body: body.trim() });
      onDone();
      // Jump straight into the new ticket's thread.
      window.location.assign(`/support/${th.ticket.id}`);
    } catch {
      setErr('Could not create the ticket. Please try again.');
    }
  }

  return (
    <Card>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 180px', gap: 12 }}>
          <Field label="School">
            <input className="input" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Sunrise Public School" />
          </Field>
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
            placeholder="Describe the issue…"
            rows={4}
            style={{ resize: 'vertical', minHeight: 96 }}
          />
        </Field>
        {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
        <div className="flex gap-8">
          <Button type="submit" disabled={!valid}>
            {create.isPending ? <Spinner /> : 'Create ticket'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
