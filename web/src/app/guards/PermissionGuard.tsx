// Route-level RBAC gate (the hard client gate; server requirePermission is final).
// Wraps a page that declares a `permission` in its PageDef.
import type { ReactNode } from 'react';
import { useAuth } from '@/shared/auth/AuthProvider';

export function PermissionGuard({ permission, children }: { permission?: string; children: ReactNode }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Not authorised</h2>
        <p style={{ color: '#667085' }}>
          You don’t have the <code>{permission}</code> permission for this page.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
