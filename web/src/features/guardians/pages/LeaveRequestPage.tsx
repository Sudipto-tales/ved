// Leave request (M7, Tier-2) — REAL guarded write. The form POSTs behind
// guardian.request_leave: a leave_request row + outbox + audit in one tx (golden rule),
// scoped to the caller's own child, created PENDING for the class teacher to approve.
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, EmptyState, Field, Icon, PageHeader } from '@/shared/ui';
import { useRequestLeave } from '../api/guardianApi';

export default function LeaveRequestPage() {
  const { childId = '' } = useParams();
  const leave = useRequestLeave(childId);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const submitted = leave.isSuccess;

  const valid = from !== '' && to !== '' && reason.trim() !== '' && to >= from;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (valid) leave.mutate({ from_date: from, to_date: to, reason });
  }

  if (submitted) {
    return (
      <div style={{ maxWidth: 560 }}>
        <PageHeader title="Leave request" subtitle="Request leave on behalf of your child." />
        <Card className="mt-16">
          <EmptyState
            icon={<Icon name="note" />}
            title="Request submitted"
            desc={`Your leave request from ${from} to ${to} has been submitted and is pending the class teacher's approval.`}
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  leave.reset();
                  setFrom('');
                  setTo('');
                  setReason('');
                }}
              >
                Submit another
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <PageHeader
        title="Leave request"
        subtitle="Let the school know in advance when your child will be absent."
      />
      <Link to="/guardian" className="subtle" style={{ fontSize: 13 }}>
        ← Back to my children
      </Link>

      <Card className="mt-16">
        <form onSubmit={onSubmit}>
          <div className="row" style={{ gap: 12 }}>
            <Field label="From">
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          {from !== '' && to !== '' && to < from && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: -4 }}>
              The end date can't be before the start date.
            </p>
          )}
          <Field label="Reason" hint="A short note for the class teacher.">
            <textarea
              className="input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. family travel, medical appointment…"
            />
          </Field>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Submitted for child #{childId.slice(0, 8)}. The school reviews and approves leave requests.
          </p>
          {leave.isError && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>
              {String((leave.error as Error)?.message ?? leave.error)}
            </p>
          )}
          <div className="mt-16">
            <Button type="submit" disabled={!valid || leave.isPending}>
              {leave.isPending ? 'Submitting…' : 'Submit request'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
