// Runtime config from Vite env (VITE_* vars). The Docker `web` service injects
// VITE_API_URL pointing at the node binary's published port.
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8081',
  /** Dev convenience: prefill the tenant id on the skeleton login screen. */
  devTenantId: import.meta.env.VITE_DEV_TENANT_ID ?? '',
};
