// Support ticket detail — the full conversation thread + a reply composer + status
// controls. This is where the whole message (not just the subject) is read and answered.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Icon, PageHeader, Select, Spinner } from '@/shared/ui';
import {
  type SupportMessage,
  useReplyTicket,
  useSetTicketStatus,
  useSupportThread,
} from '../../shared/platformApi';

const STATUS_TONE: Record<string, 'primary' | 'warning' | 'success'> = {
  open: 'primary',
  pending: 'warning',
  resolved: 'success',
};
const PRIORITY_TONE: Record<string, 'warning' | 'neutral' | 'info'> = {
  high: 'warning',
  normal: 'neutral',
  low: 'info',
};

export default function SupportDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useSupportThread(id);
  const reply = useReplyTicket(id);
  const setStatus = useSetTicketStatus(id);
  const [body, setBody] = useState('');

  const ticket = data?.ticket;
  const messages = data?.messages ?? [];

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    await reply.mutateAsync(body.trim());
    setBody('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link to="/support" className="flex gap-8" style={{ alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
          <Icon name="arrow-left" size={15} /> Support Console
        </Link>
        <PageHeader title={ticket?.subject ?? 'Ticket'} subtitle={ticket?.school_name || undefined} />
      </div>

      {isLoading && (
        <Card>
          <Spinner />
        </Card>
      )}
      {error && (
        <Card>
          <EmptyState icon={<Icon name="help" />} title="Ticket not found" desc="It may have been removed." />
        </Card>
      )}

      {ticket && (
        <>
          <Card>
            <div className="flex gap-8" style={{ alignItems: 'center' }}>
              <Badge tone={STATUS_TONE[ticket.status]}>{ticket.status}</Badge>
              <Badge tone={PRIORITY_TONE[ticket.priority]}>{ticket.priority}</Badge>
              <span className="subtle" style={{ fontSize: 12 }}>
                opened {new Date(ticket.created_at).toLocaleString()}
              </span>
              <span className="grow" style={{ flex: 1 }} />
              <Select
                value={ticket.status}
                onChange={(e) => setStatus.mutate(e.target.value as 'open' | 'pending' | 'resolved')}
                disabled={setStatus.isPending}
                title="Change status"
              >
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
              </Select>
            </div>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} />
            ))}
          </div>

          <Card>
            <form onSubmit={send} style={{ display: 'grid', gap: 10 }}>
              <textarea
                className="input"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write a reply…"
                rows={4}
                style={{ resize: 'vertical', minHeight: 96 }}
              />
              <div className="flex gap-8" style={{ alignItems: 'center' }}>
                <Button type="submit" disabled={!body.trim() || reply.isPending}>
                  {reply.isPending ? <Spinner /> : 'Send reply'}
                </Button>
                <span className="subtle" style={{ fontSize: 12 }}>
                  Sending a reply moves a resolved ticket back to pending.
                </span>
              </div>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}

function MessageBubble({ m }: { m: SupportMessage }) {
  const fromPlatform = m.author_type === 'PLATFORM';
  return (
    <div style={{ display: 'flex', justifyContent: fromPlatform ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '80%',
          background: fromPlatform ? 'var(--primary-weak)' : 'var(--surface-2)',
          borderRadius: 'var(--radius)',
          padding: '12px 14px',
        }}
      >
        <div className="flex gap-8" style={{ alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 12.5 }}>
            {fromPlatform ? m.author_name || 'Support' : m.author_name || 'School'}
          </span>
          <Badge tone="neutral">{fromPlatform ? 'Platform' : 'School'}</Badge>
          <span className="subtle" style={{ fontSize: 11 }}>
            {new Date(m.created_at).toLocaleString()}
          </span>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
      </div>
    </div>
  );
}
