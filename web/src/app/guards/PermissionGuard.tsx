// Route-level RBAC gate (the hard client gate; server requirePermission is final).
// Wraps a page that declares a `permission` in its PageDef.
import type { ReactNode } from 'react';
import { useAuth } from '@/shared/auth/AuthProvider';
import { Spinner } from '@/shared/ui';

export function PermissionGuard({ permission, children }: { permission?: string; children: ReactNode }) {
  const { hasPermission, permissionsReady } = useAuth();
  // Don't decide until the effective permission set has loaded for the active tenant,
  // else a gated page would flash "Not authorised" before perms arrive (M2).
  if (permission && !permissionsReady) {
    return (
      <div style={{ padding: 24 }}>
        <Spinner />
      </div>
    );
  }
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
