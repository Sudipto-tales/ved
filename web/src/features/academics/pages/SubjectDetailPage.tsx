// Subject detail — the subject's attributes (read-only; curriculum mapping lives on the
// Curriculum page).
import { Link, useParams } from 'react-router-dom';
import { Badge, Card, EmptyState, Icon, PageHeader, Spinner } from '@/shared/ui';
import { useSubjects } from '../api/academicsApi';

export default function SubjectDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useSubjects();
  const subject = data?.subjects.find((s) => s.id === id);

  return (
    <div>
      <PageHeader title={subject ? subject.name : 'Subject'} subtitle="A subject in the catalogue." />
      <Link to="/subjects" className="subtle" style={{ fontSize: 13 }}>← Back to subjects</Link>

      {isLoading && <div className="mt-16"><Spinner /></div>}
      {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}

      {!isLoading && !subject && (
        <Card className="mt-16"><EmptyState icon={<Icon name="book" />} title="Subject not found" desc="It may have been removed." /></Card>
      )}

      {subject && (
        <Card className="mt-16">
          <div className="row"><span className="muted" style={{ flex: 1 }}>Code</span><span style={{ fontWeight: 600 }}>{subject.code}</span></div>
          <div className="row"><span className="muted" style={{ flex: 1 }}>Kind</span><Badge tone="info">{subject.kind}</Badge></div>
        </Card>
      )}
    </div>
  );
}
