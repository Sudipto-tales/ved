// Outermost guard: logged in? else → /login. (docs/22-frontend.md routing model)
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/shared/auth/AuthProvider';

export function AuthGuard() {
  const { isAuthed } = useAuth();
  return isAuthed ? <Outlet /> : <Navigate to="/login" replace />;
}
