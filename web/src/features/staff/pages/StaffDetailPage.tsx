// Staff detail (M5).
import { Link, useParams } from 'react-router-dom';
import { Badge, Card, PageHeader, Spinner } from '@/shared/ui';
import { useStaffMember } from '../api/staffApi';

export default function StaffDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useStaffMember(id);

  if (isLoading) return <div style={{ padding: 24 }}><Spinner /></div>;
  if (error) return <p style={{ color: 'var(--danger)', padding: 24 }}>Failed to load: {String(error)}</p>;
  if (!data) return null;

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader title={data.name} subtitle={data.designation || 'Staff'} />
      <Link to="/staff" className="subtle" style={{ fontSize: 13 }}>← Back to staff</Link>
      <Card className="mt-16">
        <div className="row"><span className="muted">Login</span><code>{data.login_identifier}</code></div>
        <div className="row"><span className="muted">Status</span><Badge tone={data.status === 'ACTIVE' ? 'success' : 'neutral'}>{data.status}</Badge></div>
        {data.department && <div className="row"><span className="muted">Department</span><span>{data.department}</span></div>}
        {data.employee_code && <div className="row"><span className="muted">Employee code</span><span>{data.employee_code}</span></div>}
        {data.joining_date && <div className="row"><span className="muted">Joining date</span><span>{data.joining_date}</span></div>}
      </Card>
    </div>
  );
}
