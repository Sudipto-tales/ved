// Notices (M7, Tier-1) — DESIGNED SCAFFOLD. The communication slice (notices/notifications,
// docs/22) is not built yet, so there is no notices backend. This renders the finished
// list shell with an EmptyState; when communication ships, the list maps real notices and
// each row links to the acknowledge view.
import { Card, EmptyState, Icon, PageHeader } from '@/shared/ui';

export default function NoticesPage() {
  return (
    <div>
      <PageHeader
        title="Notices"
        subtitle="Announcements and circulars the school has shared with guardians."
      />
      <Card className="mt-16">
        <EmptyState
          icon={<Icon name="bell" />}
          title="No notices yet"
          desc="When the school publishes a notice — a holiday circular, a fee reminder, an event invite — it will appear here, and any that need your acknowledgement will be flagged."
        />
      </Card>
    </div>
  );
}
