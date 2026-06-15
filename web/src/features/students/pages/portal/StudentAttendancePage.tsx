// STUDENT portal — My attendance (DESIGNED SCAFFOLD). Identity-scoped placeholder.
import { PortalPage } from './PortalScaffold';

export default function StudentAttendancePage() {
  return (
    <PortalPage
      title="My attendance"
      subtitle="Your day-by-day attendance and term percentage."
      icon="chart"
      comingTitle="Attendance is coming soon"
      comingDesc="When the attendance slice is wired, you'll see your present/absent days, a term percentage, and a calendar heatmap here."
    />
  );
}
