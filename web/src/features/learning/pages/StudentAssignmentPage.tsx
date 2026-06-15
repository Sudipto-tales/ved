// Assignment (student view) — DESIGNED SCAFFOLD. There is no per-student assignment-read
// endpoint yet, so this shows the assignment id in scope plus a path to submit. When a
// read endpoint lands, the Card fills with the brief, materials, and due date.
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Icon, PageHeader } from '@/shared/ui';

export default function StudentAssignmentPage() {
  const { id = '' } = useParams();

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="Assignment" subtitle="The brief, attached materials, and your submission status." />
      <Link to="/assignments" className="subtle" style={{ fontSize: 13 }}>← Back to my assignments</Link>

      <Card className="mt-16">
        <div className="flex gap-8" style={{ alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Assignment</span>
          {id && <Badge tone="neutral">{id}</Badge>}
        </div>
        <div className="mt-16">
          <EmptyState
            icon={<Icon name="note" size={30} />}
            title="Assignment details coming soon"
            desc="A student-scoped read endpoint (brief, materials, due date) is on the roadmap. You can submit your work now."
            action={<Link to={`/assignments/${id}/submit`}><Button>Submit work</Button></Link>}
          />
        </div>
      </Card>
    </div>
  );
}
