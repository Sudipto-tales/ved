// STUDENT portal — My marks / report card (DESIGNED SCAFFOLD). Identity-scoped.
import { PortalPage } from './PortalScaffold';

export default function StudentMarksPage() {
  return (
    <PortalPage
      title="My marks"
      subtitle="Your assessment scores and report cards."
      icon="book"
      comingTitle="Marks and report cards are coming soon"
      comingDesc="When the examinations slice is wired, you'll see your subject-wise scores, grades, and downloadable report cards here."
    />
  );
}
