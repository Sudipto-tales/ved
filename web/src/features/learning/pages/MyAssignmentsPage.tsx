// My Assignments (student) — DESIGNED SCAFFOLD. There is no "assignments for the calling
// student" list endpoint yet (the backend lists by teaching_assignment for teachers, and
// resolves the student only on submit). This is the clean shell: when a student-scoped
// query lands, the EmptyState becomes a DataTable of due work.
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, PageHeader } from '@/shared/ui';

export default function MyAssignmentsPage() {
  return (
    <div>
      <PageHeader
        title="My Assignments"
        subtitle="Assignments set for your class, with due dates and submission status."
      />

      <Card>
        <EmptyState
          icon={<Icon name="book" size={30} />}
          title="Your assignment list will appear here"
          desc="A student-scoped assignment feed is on the roadmap. In the meantime you can submit work directly if you have an assignment id."
          action={<Link to="/assignments/new/submit"><Button>Submit work</Button></Link>}
        />
      </Card>
    </div>
  );
}
