// Notice acknowledge (M7, Tier-2) — DESIGNED SCAFFOLD. No communication backend exists,
// so the notice body is a placeholder and the Acknowledge action is local-only (no write).
// When communication ships, this loads the notice by id and POSTs an acknowledgement
// (row + outbox + audit) behind a guardian permission.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Icon, PageHeader } from '@/shared/ui';

export default function NoticeAcknowledgePage() {
  const { noticeId = '' } = useParams();
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div>
      <PageHeader
        title="Acknowledge notice"
        subtitle="Some notices require your confirmation that you've read them."
      />
      <Link to="/guardian/notices" className="subtle" style={{ fontSize: 13 }}>
        ← Back to notices
      </Link>

      <Card className="mt-16">
        <div className="row">
          <span style={{ fontWeight: 600, flex: 1 }}>Notice #{noticeId.slice(0, 8)}</span>
          {acknowledged ? (
            <Badge tone="success">Acknowledged</Badge>
          ) : (
            <Badge tone="warning">Action needed</Badge>
          )}
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          The notice content will appear here once the communication module is available.
          You'll be able to read it and confirm your acknowledgement, which the school
          records against your account.
        </p>
        <div className="mt-16">
          <Button
            disabled={acknowledged}
            onClick={() => setAcknowledged(true)}
          >
            {acknowledged ? 'Acknowledged' : 'I acknowledge this notice'}
          </Button>
        </div>
      </Card>

      {acknowledged && (
        <Card className="mt-16">
          <EmptyState
            icon={<Icon name="shield" />}
            title="Thanks — recorded locally"
            desc="This is a preview. Once the communication module is live, your acknowledgement will be saved to the school's records (with an audit trail)."
          />
        </Card>
      )}
    </div>
  );
}
