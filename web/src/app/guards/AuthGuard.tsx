// Outermost guard: logged in? else → /login. (docs/22-frontend.md routing model)
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/shared/auth/AuthProvider';

export function AuthGuard() {
  const { isAuthed } = useAuth();
  // M11: a super-admin "Login As" handoff lands at the app root carrying its token in the
  // hash (#login-as=…). Route it to the public /activate landing (which hydrates the session)
  // before bouncing an unauthenticated visitor to /login.
  if (!isAuthed && typeof location !== 'undefined' && location.hash.includes('login-as=')) {
    return <Navigate to={`/activate${location.hash}`} replace />;
  }
  return isAuthed ? <Outlet /> : <Navigate to="/login" replace />;
}
