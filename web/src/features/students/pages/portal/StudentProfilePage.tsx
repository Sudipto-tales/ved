// STUDENT portal — My profile (DESIGNED SCAFFOLD). Identity-scoped. Real two-card layout
// (identity + guardians) the live view will keep; values are placeholders until the
// /api/v1/me/student endpoint exists.
import { Badge, Card, EmptyState, Icon, PageHeader } from '@/shared/ui';

export default function StudentProfilePage() {
  return (
    <div>
      <PageHeader title="My profile" subtitle="Your admission record and registered guardians." />

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Identity</h3>
        <div className="row"><span className="muted">Name</span><span className="muted">—</span></div>
        <div className="row"><span className="muted">Admission no</span><span className="muted">—</span></div>
        <div className="row"><span className="muted">Class / section</span><span className="muted">—</span></div>
        <div className="row"><span className="muted">Status</span><Badge tone="neutral">soon</Badge></div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Guardians</h3>
        <EmptyState
          icon={<Icon name="users" size={28} />}
          title="Your guardians will appear here"
          desc="Once the student profile endpoint is wired, your linked guardians and their contact details will be shown."
        />
      </Card>
    </div>
  );
}
