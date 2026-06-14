// Single source of truth for localStorage keys, shared by the API client and the
// auth/tenant providers so the header values and the React state never drift.
export const STORAGE = {
  token: 'ved.token', // access JWT
  refresh: 'ved.refresh', // refresh JWT
  permissions: 'ved.permissions',
  tenant: 'ved.tenant',
  memberships: 'ved.memberships',
  session: 'ved.session', // { userId, mustReset }
} as const;
