// STUDENT portal — My timetable (DESIGNED SCAFFOLD). Identity-scoped.
import { PortalPage } from './PortalScaffold';

export default function StudentTimetablePage() {
  return (
    <PortalPage
      title="My timetable"
      subtitle="Your weekly class schedule."
      icon="grid"
      comingTitle="Timetable is coming soon"
      comingDesc="When the timetable slice is wired, you'll see your weekly period grid — subjects, teachers, and rooms — here."
    />
  );
}
