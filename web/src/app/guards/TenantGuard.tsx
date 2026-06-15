// Active tenant resolved? else → /login (which doubles as the tenant picker at M0).
// Arms the X-Tenant-ID header that the API client sends for RLS.
import { Navigate, Outlet } from 'react-router-dom';
import { useTenant } from '@/shared/tenant/TenantProvider';

export function TenantGuard() {
  const { hasTenant } = useTenant();
  return hasTenant ? <Outlet /> : <Navigate to="/login" replace />;
}
