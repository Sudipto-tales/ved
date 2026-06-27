// School-side ticket thread — read the full conversation and reply. Platform replies
// arrive here once they sync down from the control plane.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Icon, PageHeader, Spinner } from '@/shared/ui';
import { type SupportMessage, useAddMessage, useSupportTicket } from '../api/supportApi';

const STATUS_TONE: Record<string, 'primary' | 'warning' | 'success'> = {
  open: 'primary',
  pending: 'warning',
  resolved: 'success',
};

export default function SupportTicketPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useSupportTicket(id);
  const add = useAddMessage(id);
  const [body, setBody] = useState('');

  const ticket = data?.ticket;
  const messages = data?.messages ?? [];

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    await add.mutateAsync(body.trim());
    setBody('');
  }

  return (
    <div style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link to="/support" className="flex gap-8" style={{ alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
          <Icon name="arrow-left" size={15} /> Support
        </Link>
        <PageHeader title={ticket?.subject ?? 'Request'} />
      </div>

      {isLoading && (
        <Card>
          <Spinner />
        </Card>
      )}
      {error && (
        <Card>
          <EmptyState icon={<Icon name="help" />} title="Request not found" />
        </Card>
      )}

      {ticket && (
        <>
          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <Badge tone={STATUS_TONE[ticket.status]}>{ticket.status}</Badge>
            <span className="subtle" style={{ fontSize: 12 }}>
              opened {new Date(ticket.created_at).toLocaleString()}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} />
            ))}
          </div>

          {ticket.status === 'resolved' ? (
            <Card>
              <p className="subtle" style={{ fontSize: 13, margin: 0 }}>
                This request is resolved. Sending a new message reopens it.
              </p>
            </Card>
          ) : null}

          <Card>
            <form onSubmit={send} style={{ display: 'grid', gap: 10 }}>
              <textarea
                className="input"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write a message…"
                rows={4}
                style={{ resize: 'vertical', minHeight: 96 }}
              />
              <div>
                <Button type="submit" disabled={!body.trim() || add.isPending}>
                  {add.isPending ? <Spinner /> : 'Send'}
                </Button>
              </div>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}

function MessageBubble({ m }: { m: SupportMessage }) {
  const fromSchool = m.author_type === 'SCHOOL';
  return (
    <div style={{ display: 'flex', justifyContent: fromSchool ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '80%',
          background: fromSchool ? 'var(--primary-weak)' : 'var(--surface-2)',
          borderRadius: 'var(--radius)',
          padding: '12px 14px',
        }}
      >
        <div className="flex gap-8" style={{ alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 12.5 }}>{m.author_name || (fromSchool ? 'You' : 'VED Support')}</span>
          <Badge tone="neutral">{fromSchool ? 'You' : 'Platform'}</Badge>
          <span className="subtle" style={{ fontSize: 11 }}>
            {new Date(m.created_at).toLocaleString()}
          </span>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
      </div>
    </div>
  );
}
