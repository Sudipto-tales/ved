// Tenant picker — shown when a user belongs to more than one school. Picking sets
// the active tenant (X-Tenant-ID) and enters the app. If the session is gone, bounce
// back to login.
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/auth/AuthProvider';
import { useTenant } from '@/shared/tenant/TenantProvider';

export default function SelectTenantPage() {
  const { isAuthed, memberships, mustReset } = useAuth();
  const { setTenant } = useTenant();
  const navigate = useNavigate();

  if (!isAuthed) return <Navigate to="/login" replace />;
  if (mustReset) return <Navigate to="/reset-password" replace />;

  function choose(tenantId: string) {
    setTenant(tenantId);
    navigate('/', { replace: true });
  }

  return (
    <div>
      <h2 style={{ fontSize: 18 }}>Choose a school</h2>
      <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        Your account belongs to several schools. Pick the one to work in.
      </p>
      <div className="mt-16" style={{ display: 'grid', gap: 8 }}>
        {memberships.map((m) => (
          <button key={m.membership_id} className="tenant-option" onClick={() => choose(m.tenant_id)}>
            <span style={{ fontWeight: 600 }}>School {m.tenant_id.slice(0, 8)}…</span>
            <span className="subtle" style={{ fontSize: 12 }}>{m.user_type}</span>
          </button>
        ))}
        {memberships.length === 0 && (
          <p className="muted">No active memberships found for this account.</p>
        )}
      </div>
    </div>
  );
}
