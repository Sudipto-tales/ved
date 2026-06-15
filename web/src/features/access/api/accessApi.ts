// Typed hooks for the access (RBAC) slice — thin wrappers over the shared api client,
// mirroring the backend contract (internal/features/access). No component calls fetch
// directly (plan/bridges.md §1).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export interface Permission {
  key: string;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  is_system: boolean;
  permissions: string[];
}

export interface Member {
  membership_id: string;
  login_identifier: string;
  user_type: string;
  status: string;
  role_ids: string[];
}

export interface Designation {
  id: string;
  name: string;
  applies_to_user_type?: string | null;
}

export interface TenantProfile {
  id: string;
  display_name: string;
  slug: string;
  institution_type: string;
}

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

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
    queryFn: () => api.get<{ permissions: Permission[] }>('/api/v1/access/permissions'),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: accessKeys.roles,
    queryFn: () => api.get<{ roles: Role[] }>('/api/v1/access/roles'),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; permissions: string[] }) =>
      api.post<Role>('/api/v1/access/roles', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKeys.roles }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; permissions: string[] }) =>
      api.put<Role>(`/api/v1/access/roles/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKeys.roles }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/api/v1/access/roles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKeys.roles }),
  });
}

export function useMembers() {
  return useQuery({
    queryKey: accessKeys.members,
    queryFn: () => api.get<{ members: Member[] }>('/api/v1/access/members'),
  });
}

export function useSetMemberRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, roleIds }: { membershipId: string; roleIds: string[] }) =>
      api.put<void>(`/api/v1/access/members/${membershipId}/roles`, { role_ids: roleIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKeys.members }),
  });
}

export function useDesignations() {
  return useQuery({
    queryKey: accessKeys.designations,
    queryFn: () => api.get<{ designations: Designation[] }>('/api/v1/access/designations'),
  });
}

export function useCreateDesignation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; applies_to_user_type?: string | null }) =>
      api.post<Designation>('/api/v1/access/designations', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKeys.designations }),
  });
}

export function useTenantProfile() {
  return useQuery({
    queryKey: accessKeys.profile,
    queryFn: () => api.get<TenantProfile>('/api/v1/access/profile'),
  });
}

export function useAcademicYears() {
  return useQuery({
    queryKey: accessKeys.academicYears,
    queryFn: () => api.get<{ academic_years: AcademicYear[] }>('/api/v1/access/academic-years'),
  });
}
