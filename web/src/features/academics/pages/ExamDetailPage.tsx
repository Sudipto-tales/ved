// Exam detail — the exam's attributes + a shortcut into marks entry.
import { Link, useParams } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, PageHeader, Spinner } from '@/shared/ui';
import { useExams } from '../api/academicsApi';

export default function ExamDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useExams();
  const exam = data?.exams.find((e) => e.id === id);

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader title={exam ? exam.name : 'Exam'} subtitle="An assessment event. Enter marks per enrolled student and subject." />
      <Link to="/exams" className="subtle" style={{ fontSize: 13 }}>← Back to exams</Link>

      {isLoading && <div className="mt-16"><Spinner /></div>}
      {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}

      {!isLoading && !exam && (
        <Card className="mt-16"><EmptyState icon={<Icon name="chart" />} title="Exam not found" /></Card>
      )}

      {exam && (
        <Card className="mt-16">
          <div className="row"><span className="muted" style={{ flex: 1 }}>Max marks</span><span style={{ fontWeight: 600 }}>{exam.max_marks}</span></div>
          <div className="mt-16">
            <Link to="/marks"><Button>Enter marks</Button></Link>
          </div>
        </Card>
      )}
    </div>
  );
}
