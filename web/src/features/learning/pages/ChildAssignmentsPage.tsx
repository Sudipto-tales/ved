// Child Assignment Status (guardian) — DESIGNED SCAFFOLD. The guardian portal is a
// child-scoped projection (docs/18); a child-assignment read endpoint isn't built yet.
// This is the clean shell — when the scoped read lands, the EmptyState becomes a per-child
// list of assignments + submission/grade status.
import { Card, EmptyState, Icon, PageHeader } from '@/shared/ui';

export default function ChildAssignmentsPage() {
  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader
        title="Child Assignment Status"
        subtitle="See what your child has been set, what's submitted, and how it was graded."
      />

      <Card>
        <EmptyState
          icon={<Icon name="users" size={30} />}
          title="Assignment status coming soon"
          desc="A child-scoped assignment feed (set · submitted · graded) is on the roadmap, layered on the guardian portal's existing child-scoped reads."
        />
      </Card>
    </div>
  );
}
