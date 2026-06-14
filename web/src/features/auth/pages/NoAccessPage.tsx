// Friendly dead-end when an authenticated user has no active memberships (e.g. a
// suspended account, or one not yet attached to any school).
import { Link } from 'react-router-dom';
import { useAuth } from '@/shared/auth/AuthProvider';

export default function NoAccessPage() {
  const { logout } = useAuth();
  return (
    <div>
      <h2 style={{ fontSize: 18 }}>No school access yet</h2>
      <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        Your account isn't attached to any active school. Ask your administrator to add
        you, then sign in again.
      </p>
      <div className="mt-16">
        <Link to="/login" className="btn btn-secondary" onClick={() => logout()} style={{ width: '100%' }}>
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
