// Loads the caller's EFFECTIVE permissions for the active tenant (M2). Runs inside the
// authed + tenant-scoped tree (mounted by AppShell): whenever the active tenant changes
// it re-fetches GET /api/v1/me/permissions and pushes the set into AuthProvider, which
// flips `permissionsReady` true. This is the bridge from the server's RBAC resolver to
// the client's <Can> / <PermissionGuard> gates (plan/bridges.md §4).
import { useEffect } from 'react';
import { api } from '@/shared/api/client';
import { useAuth } from './AuthProvider';
import { useTenant } from '@/shared/tenant/TenantProvider';

export function useSyncPermissions() {
  const { isAuthed, setPermissions } = useAuth();
  const { activeTenantId } = useTenant();

  useEffect(() => {
    if (!isAuthed || !activeTenantId) return;
    let cancelled = false;
    api
      .get<{ permissions: string[] }>('/api/v1/me/permissions')
      .then((res) => {
        if (!cancelled) setPermissions(res.permissions ?? []);
      })
      .catch(() => {
        if (!cancelled) setPermissions([]); // no permissions on failure (fail closed)
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthed, activeTenantId, setPermissions]);
}
