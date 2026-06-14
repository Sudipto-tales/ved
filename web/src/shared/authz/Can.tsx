// RBAC seam on the client (plan/bridges.md §4). <Can> hides UI the user can't use;
// it is the COSMETIC gate. The hard gate is the route-level <PermissionGuard> and,
// ultimately, the server's requirePermission. Never rely on <Can> for security.
import type { ReactNode } from 'react';
import { useAuth } from '@/shared/auth/AuthProvider';

export function usePermission(): (perm?: string) => boolean {
  return useAuth().hasPermission;
}

export function Can({ permission, children }: { permission?: string; children: ReactNode }) {
  const can = useAuth().hasPermission(permission);
  return can ? <>{children}</> : null;
}
