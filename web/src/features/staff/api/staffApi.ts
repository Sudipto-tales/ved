// Staff slice FE surface (M5). Types + HTTP calls are GENERATED from the frozen OpenAPI
// spec (server/api/openapi) via `npm run gen:api` — see studentsApi.ts for the pattern.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api/queryKeys';
import { onboardStaff, listStaff, getStaff } from '@/shared/api/generated/staff/staff';
import type {
  OnboardStaffBody,
  OnboardStaff201,
  ListStaff200StaffItem,
  GetStaff200,
} from '@/shared/api/generated/model';

// Generated types, re-exported under the names this slice's components already use.
export type OnboardInput = OnboardStaffBody;
export type OnboardResult = OnboardStaff201;
export type StaffRow = ListStaff200StaffItem;
export type StaffDetail = GetStaff200;

export function useStaff() {
  return useQuery({
    queryKey: queryKeys.staff,
    queryFn: ({ signal }) => listStaff(signal),
  });
}

export function useStaffMember(id: string) {
  return useQuery({
    queryKey: [...queryKeys.staff, id],
    queryFn: ({ signal }) => getStaff(id, signal),
    enabled: !!id,
  });
}

export function useOnboardStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OnboardInput) => onboardStaff(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff }),
  });
}
