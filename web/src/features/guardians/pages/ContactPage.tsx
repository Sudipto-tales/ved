// Update own contact (M7, Tier-2) — DESIGNED SCAFFOLD. There is no guardian self-update
// endpoint yet; per docs/18 contact changes go through the school as maker-checker (the
// guardian proposes, staff approves). This renders the finished form; Save is local-only
// and shows the pending-approval note. When the write lands, Save POSTs a change request
// behind guardian.update_own_contact (row + outbox + audit).
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Field, Icon, PageHeader } from '@/shared/ui';
import { useRequestContactChange } from '../api/guardianApi';

export default function ContactPage() {
  const contact = useRequestContactChange();
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const submitted = contact.isSuccess;
  const valid = phone.trim() !== '' || email.trim() !== '';

  function onSave(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    contact.mutate({
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(email.trim() ? { email: email.trim() } : {}),
    });
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <PageHeader
        title="My contact details"
        subtitle="Keep your phone and email current so the school can reach you."
      />
      <Link to="/guardian" className="subtle" style={{ fontSize: 13 }}>
        ← Back to my children
      </Link>

      <Card className="mt-16">
        <form onSubmit={onSave}>
          <Field label="Phone">
            <input
              className="input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 90000 00000"
            />
          </Field>
          <Field label="Email" hint="Used for fee reminders and notices.">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Changes don't apply immediately — they go through the school for approval
            (maker-checker). You'll see the update once a staff member confirms it.
          </p>
          {contact.isError && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>
              {String((contact.error as Error)?.message ?? contact.error)}
            </p>
          )}
          <div className="mt-16">
            <Button type="submit" disabled={!valid || submitted || contact.isPending}>
              {contact.isPending ? 'Submitting…' : submitted ? 'Submitted for approval' : 'Request changes'}
            </Button>
          </div>
        </form>
      </Card>

      {submitted && (
        <Card className="mt-16">
          <EmptyState
            icon={<Icon name="shield" />}
            title="Sent for school approval"
            desc="Your request has been queued for a staff member to review. The change takes effect once they approve it."
          />
        </Card>
      )}
    </div>
  );
}
