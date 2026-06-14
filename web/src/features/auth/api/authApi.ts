// Auth API (M1) — typed hooks over the generated-client surface (`api`). The
// contract mirrors the backend identity slice: /auth/login, /auth/refresh,
// /auth/reset-password, /api/v1/me/memberships (docs/plan/bridges.md §2).
import { api } from '@/shared/api/client';

export interface Membership {
  membership_id: string;
  tenant_id: string;
  user_type: string;
}

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  must_reset_password: boolean;
  memberships: Membership[];
}

export function login(loginIdentifier: string, password: string) {
  return api.post<LoginResult>('/auth/login', {
    login_identifier: loginIdentifier,
    password,
  });
}

export function refresh(refreshToken: string) {
  return api.post<LoginResult>('/auth/refresh', { refresh_token: refreshToken });
}

export function resetPassword(currentPassword: string, newPassword: string) {
  return api.post<void>('/auth/reset-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}
