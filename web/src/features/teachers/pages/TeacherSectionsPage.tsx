// Teacher portal — My sections / students. DESIGNED SCAFFOLD. There is no "sections this
// teacher teaches" projection yet (teaching_assignment binds teacher × subject × section,
// but no scoped read endpoint exists). This is the clean shell; when the projection lands
// the EmptyState becomes a Card list of sections with rosters.
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, PageHeader } from '@/shared/ui';

export default function TeacherSectionsPage() {
  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader title="My sections & students" subtitle="The classes you teach and the students in them." />

      <Card>
        <EmptyState
          icon={<Icon name="layers" size={30} />}
          title="Your sections will appear here"
          desc="A teacher-scoped sections projection (the classes bound to you via teaching assignments) is on the roadmap. You can still mark attendance and enter marks by entering a section or exam id."
          action={<Link to="/portal/teacher/attendance"><Button>Mark attendance</Button></Link>}
        />
      </Card>
    </div>
  );
}
