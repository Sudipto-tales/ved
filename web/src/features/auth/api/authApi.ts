// Auth API (M1) — GENERATED from the frozen OpenAPI spec (server/api/openapi) via
// `npm run gen:api`. The contract is the identity slice: /auth/login, /auth/refresh,
// /auth/reset-password, /api/v1/me/memberships (docs/plan/bridges.md §2). These thin
// wrappers keep the call sites (useAuthFlow) stable.
import {
  login as genLogin,
  refresh as genRefresh,
  resetPassword as genResetPassword,
} from '@/shared/api/generated/identity/identity';
import type { Login200, Login200MembershipsItem } from '@/shared/api/generated/model';

export type Membership = Login200MembershipsItem;
export type LoginResult = Login200;

export function login(loginIdentifier: string, password: string) {
  return genLogin({ login_identifier: loginIdentifier, password });
}

export function refresh(refreshToken: string) {
  return genRefresh({ refresh_token: refreshToken });
}

export function resetPassword(currentPassword: string, newPassword: string) {
  return genResetPassword({ current_password: currentPassword, new_password: newPassword });
}
