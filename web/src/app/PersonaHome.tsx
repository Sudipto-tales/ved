// The app index ("/"). Routes each persona to their natural landing: EMPLOYEE (admin/
// staff) → the management Dashboard; TEACHER/STUDENT/GUARDIAN → their portal home. This
// keeps a student from landing on (and 403-ing against) the admin dashboard.
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/auth/AuthProvider';
import { useTenant } from '@/shared/tenant/TenantProvider';
import DashboardPage from '@/features/dashboard/DashboardPage';

const HOME_FOR: Record<string, string> = {
  TEACHER: '/teacher',
  STUDENT: '/student',
  GUARDIAN: '/guardian',
};

export function PersonaHome() {
  const { memberships } = useAuth();
  const { activeTenantId } = useTenant();
  const userType = memberships.find((m) => m.tenant_id === activeTenantId)?.user_type ?? 'EMPLOYEE';
  const dest = HOME_FOR[userType];
  return dest ? <Navigate to={dest} replace /> : <DashboardPage />;
}
