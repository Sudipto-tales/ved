// STUDENT portal — Notices (DESIGNED SCAFFOLD). Identity-scoped.
import { PortalPage } from './PortalScaffold';

export default function StudentNoticesPage() {
  return (
    <PortalPage
      title="Notices"
      subtitle="Announcements from your school."
      icon="bell"
      comingTitle="Notices are coming soon"
      comingDesc="When the communications slice is wired, school-wide and class-targeted announcements will appear here, newest first."
    />
  );
}
