// Access (RBAC) slice FE surface. Types + HTTP calls are GENERATED from the frozen
// OpenAPI spec (server/api/openapi) via `npm run gen:api` — see studentsApi.ts for the
// reference pattern. Hook names/signatures are unchanged so components need no edits.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import {
  listPermissions,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listMembers,
  setMemberRoles,
  listDesignations,
  createDesignation,
  getTenantProfile,
  listAcademicYears,
} from '@/shared/api/generated/access/access';
import type {
  ListPermissions200PermissionsItem,
  ListRoles200RolesItem,
  ListMembers200MembersItem,
  ListDesignations200DesignationsItem,
  GetTenantProfile200,
  ListAcademicYears200AcademicYearsItem,
} from '@/shared/api/generated/model';

// Generated types, re-exported under the names this slice's components already use.
export type Permission = ListPermissions200PermissionsItem;
export type Role = ListRoles200RolesItem;
export type Member = ListMembers200MembersItem;
export type Designation = ListDesignations200DesignationsItem;
export type TenantProfile = GetTenantProfile200;
export type AcademicYear = ListAcademicYears200AcademicYearsItem;

export const accessKeys = {
  permissions: ['access', 'permissions'] as const,
  roles: ['access', 'roles'] as const,
  members: ['access', 'members'] as const,
  designations: ['access', 'designations'] as const,
  profile: ['access', 'profile'] as const,
  academicYears: ['access', 'academic-years'] as const,
};

export function usePermissionCatalog() {
  return useQuery({
    queryKey: accessKeys.permissions,
    queryFn: ({ signal }) => listPermissions(signal),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: accessKeys.roles,
    queryFn: ({ signal }) => listRoles(signal),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; permissions: string[] }) => createRole(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKeys.roles }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; permissions: string[] }) =>
      updateRole(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKeys.roles }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKeys.roles }),
  });
}

export function useMembers() {
  return useQuery({
    queryKey: accessKeys.members,
    queryFn: ({ signal }) => listMembers(signal),
  });
}

export function useSetMemberRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, roleIds }: { membershipId: string; roleIds: string[] }) =>
      setMemberRoles(membershipId, { role_ids: roleIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKeys.members }),
  });
}

export function useDesignations() {
  return useQuery({
    queryKey: accessKeys.designations,
    queryFn: ({ signal }) => listDesignations(signal),
  });
}

export function useCreateDesignation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; applies_to_user_type?: string | null }) =>
      createDesignation({ name: body.name, applies_to_user_type: body.applies_to_user_type ?? undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKeys.designations }),
  });
}

export function useTenantProfile() {
  return useQuery({
    queryKey: accessKeys.profile,
    queryFn: ({ signal }) => getTenantProfile(signal),
  });
}

export function useAcademicYears() {
  return useQuery({
    queryKey: accessKeys.academicYears,
    queryFn: ({ signal }) => listAcademicYears(signal),
  });
}

// ── M11: Super-Admin Access consent ──────────────────────────────────────────
// The tenant-owned switch that lets the platform super-admin "Login As" into this
// school. Off by default; the control-plane impersonation endpoint 403s unless this is
// on. Not in the frozen OpenAPI spec yet, so it uses the raw client (cf. adminApi.ts).
export interface SuperAdminAccess {
  allow_superadmin_access: boolean;
}

const superAdminAccessKey = ['access', 'superadmin-access'] as const;

export function useSuperAdminAccess() {
  return useQuery({
    queryKey: superAdminAccessKey,
    queryFn: () => api.get<SuperAdminAccess>('/api/v1/access/superadmin-access'),
  });
}

export function useSetSuperAdminAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (allow: boolean) =>
      api.put<void>('/api/v1/access/superadmin-access', { allow_superadmin_access: allow }),
    onSuccess: () => qc.invalidateQueries({ queryKey: superAdminAccessKey }),
  });
}
