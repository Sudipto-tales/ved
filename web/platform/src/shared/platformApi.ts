// Platform v2 (M9) API surface — typed hooks over the control-plane super-admin endpoints
// (server/internal/features/registration/platform_v2.go). Uses the manual `api` client (the
// same pattern as the dashboard/tenants/licenses pages); analytics endpoints are read-only.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

// ── shared shapes ───────────────────────────────────────────────────────────
export interface Point {
  label: string;
  value: number;
}

// ── registrations ────────────────────────────────────────────────────────────
export interface RegistrationAnalytics {
  total: number;
  pending: number;
  under_review: number;
  approved: number;
  rejected: number;
  approval_rate_pct: number;
  avg_approval_hours: number;
  volume_per_day: Point[];
  funnel: Point[];
}

export function useRegistrationAnalytics() {
  return useQuery({
    queryKey: ['platform', 'registrations', 'analytics'],
    queryFn: () => api.get<RegistrationAnalytics>('/api/v1/platform/registrations/analytics'),
  });
}

export function useRemindRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<void>(`/api/v1/platform/registrations/${id}/remind`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'registrations'] }),
  });
}

// ── payment proofs ────────────────────────────────────────────────────────────
export interface PaymentAnalytics {
  pending: number;
  approval_rate_pct: number;
  avg_verification_hours: number;
}

export function usePaymentAnalytics() {
  return useQuery({
    queryKey: ['platform', 'payment-proofs', 'analytics'],
    queryFn: () => api.get<PaymentAnalytics>('/api/v1/platform/payment-proofs/analytics'),
  });
}

export function useRequestClarification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post<void>(`/api/v1/platform/payment-proofs/${id}/request-info`, { note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'payment-proofs'] }),
  });
}

// ── licenses ──────────────────────────────────────────────────────────────────
export interface License {
  id: string;
  tenant_id: string;
  tenant_slug: string;
  plan: string;
  seats: number;
  status: string;
  auto_renew: boolean;
  cancel_at_period_end: boolean;
  issued_at: string;
  expires_at: string;
  revoked: boolean;
}

export interface LicenseAnalytics {
  total: number;
  active: number;
  expiring_this_month: number;
  cancelled_this_month: number;
  new_this_month: number;
  distribution: Point[];
}

export function useLicenses() {
  return useQuery({
    queryKey: ['platform', 'licenses', 'list'],
    queryFn: () => api.get<{ licenses: License[] }>('/api/v1/platform/licenses/list'),
  });
}

export function useLicenseAnalytics() {
  return useQuery({
    queryKey: ['platform', 'licenses', 'analytics'],
    queryFn: () => api.get<LicenseAnalytics>('/api/v1/platform/licenses/analytics'),
  });
}

function invalidateLicenses(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['platform', 'licenses'] });
}

export function useLicenseAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: 'suspend' | 'resume' | 'cancel' | 'extend' | 'change-plan'; body?: unknown }) =>
      api.post<{ license_id?: string }>(`/api/v1/platform/licenses/${id}/${action}`, body),
    onSuccess: () => invalidateLicenses(qc),
  });
}

// ── subscriptions ─────────────────────────────────────────────────────────────
export interface SubscriptionAnalytics {
  mrr: number;
  arr: number;
  growth_pct: number;
  active_tenants: number;
  new_tenants: number;
  churn_rate_pct: number;
  licenses_active: number;
  licenses_expired: number;
  licenses_suspended: number;
  revenue_trend: Point[];
  subscription_growth: Point[];
  plan_popularity: Point[];
}

export function useSubscriptionAnalytics() {
  return useQuery({
    queryKey: ['platform', 'subscriptions', 'analytics'],
    queryFn: () => api.get<SubscriptionAnalytics>('/api/v1/platform/subscriptions/analytics'),
  });
}

// ── plans ─────────────────────────────────────────────────────────────────────
export interface Plan {
  id: string;
  name: string;
  tier: string;
  currency: string;
  price: number;
  annual_price: number;
  billing_cycle: string;
  seats: number;
  enabled_modules: string[];
  status: string;
  active_subscribers: number;
  created_at: string;
}

export interface PlanInput {
  name: string;
  tier: string;
  currency: string;
  price: number;
  annual_price: number;
  billing_cycle: string;
  seats: number;
  enabled_modules: string[];
}

export function usePlatformPlans() {
  return useQuery({
    queryKey: ['platform', 'plans', 'manage'],
    queryFn: () => api.get<{ plans: Plan[] }>('/api/v1/platform/plans'),
  });
}

function invalidatePlans(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['platform', 'plans'] });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PlanInput) => api.post<{ id: string }>('/api/v1/platform/plans', body),
    onSuccess: () => invalidatePlans(qc),
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PlanInput }) => api.patch<void>(`/api/v1/platform/plans/${id}`, body),
    onSuccess: () => invalidatePlans(qc),
  });
}

export function usePlanAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'duplicate' | 'archive' }) =>
      api.post<{ id?: string }>(`/api/v1/platform/plans/${id}/${action}`),
    onSuccess: () => invalidatePlans(qc),
  });
}

// ── tenants ───────────────────────────────────────────────────────────────────
export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan?: string | null;
  subscription_status?: string | null;
  subscription_id?: string | null;
  autopay_enabled: boolean;
  license_status?: string | null;
  license_expires_at?: string | null;
  users: number;
  provisioned_at?: string | null;
}

export interface BillingHistory {
  invoices: { id: string; number: string; period?: string | null; total: number; status: string; issued_at: string }[];
  proofs: { id: string; amount: number; currency: string; method: string; txn_id: string; status: string; created_at: string }[];
}

export function useTenantsEnriched() {
  return useQuery({
    queryKey: ['platform', 'tenants', 'list'],
    queryFn: () => api.get<{ tenants: TenantRow[] }>('/api/v1/platform/tenants/list'),
  });
}

export function useTenantBilling(id: string) {
  return useQuery({
    queryKey: ['platform', 'tenants', id, 'billing'],
    queryFn: () => api.get<BillingHistory>(`/api/v1/platform/tenants/${id}/billing-history`),
    enabled: !!id,
  });
}

export function useTenantAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'suspend' | 'resume' }) =>
      api.post<void>(`/api/v1/platform/tenants/${id}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'tenants'] }),
  });
}

// ── dashboard ───────────────────────────────────────────────────────────────
export interface Dashboard {
  total_tenants: number;
  active_subscriptions: number;
  monthly_revenue: number;
  pending_requests: number;
  expiring_licenses: number;
  open_support_tickets: number;
  registration_trend: Point[];
  revenue_trend: Point[];
  license_distribution: Point[];
  recent_registrations: { id: string; school_name: string; slug: string; status: string; created_at: string }[];
  recent_proofs: { id: string; school_name: string; amount: number; currency: string; status: string; created_at: string }[];
}

export function useDashboard() {
  return useQuery({
    queryKey: ['platform', 'dashboard'],
    queryFn: () => api.get<Dashboard>('/api/v1/platform/dashboard'),
  });
}

// ── settings (key → arbitrary JSON) ──────────────────────────────────────────
export type Settings = Record<string, unknown>;

export function useSettings() {
  return useQuery({
    queryKey: ['platform', 'settings'],
    queryFn: () => api.get<{ settings: Settings }>('/api/v1/platform/settings'),
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Settings) => api.put<void>('/api/v1/platform/settings', { settings }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'settings'] }),
  });
}

// ── app releases (desktop / mobile build registry) ───────────────────────────
export interface Release {
  id: string;
  platform: string;
  channel: string;
  version: string;
  file_name?: string | null;
  download_url?: string | null;
  storage_key?: string | null;
  size_bytes: number;
  notes?: string | null;
  published: boolean;
  created_at: string;
}

export interface ReleaseInput {
  platform: string;
  channel: string;
  version: string;
  file_name?: string;
  download_url?: string;
  size_bytes?: number;
  notes?: string;
  published?: boolean;
}

export function useReleases() {
  return useQuery({
    queryKey: ['platform', 'releases'],
    queryFn: () => api.get<{ releases: Release[] }>('/api/v1/platform/releases'),
  });
}

function invalidateReleases(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['platform', 'releases'] });
}

export function useCreateRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReleaseInput) => api.post<{ id: string }>('/api/v1/platform/releases', body),
    onSuccess: () => invalidateReleases(qc),
  });
}

export function usePublishRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      api.post<void>(`/api/v1/platform/releases/${id}/publish`, { published }),
    onSuccess: () => invalidateReleases(qc),
  });
}

export function useDeleteRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/api/v1/platform/releases/${id}`),
    onSuccess: () => invalidateReleases(qc),
  });
}

// ── M11: KYC / risk / source (registration review) ───────────────────────────
export interface KYCSummary {
  kyc: Record<string, number>;
  risk: Record<string, number>;
  source: Record<string, number>;
}

export function useKYCAnalytics() {
  return useQuery({
    queryKey: ['platform', 'registrations', 'kyc-analytics'],
    queryFn: () => api.get<KYCSummary>('/api/v1/platform/registrations/kyc-analytics'),
  });
}

export function useSetKYC() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      api.post<void>(`/api/v1/platform/registrations/${id}/kyc`, { status, notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'registrations'] }),
  });
}

// ── M11: Login As Tenant (impersonation) ──────────────────────────────────────
export interface ImpersonationResult {
  access_token: string;
  slug: string;
  user_id: string;
  login: string;
  expires_in_sec: number;
}

export function useLoginAs() {
  return useMutation({
    mutationFn: (tenantId: string) =>
      api.post<ImpersonationResult>(`/api/v1/platform/tenants/${tenantId}/login-as`),
  });
}

// ── M11: plan versioning / grandfathered pricing ──────────────────────────────
export interface PlanVersion {
  id: string;
  plan_id: string;
  version: number;
  monthly_price: number;
  annual_price: number;
  currency: string;
  effective_date: string;
  status: string;
  active_subscribers: number;
  price_diff: number;
  is_latest: boolean;
}

export function usePlanVersions(planId: string | null) {
  return useQuery({
    queryKey: ['platform', 'plans', planId, 'versions'],
    queryFn: () => api.get<{ versions: PlanVersion[] }>(`/api/v1/platform/plans/${planId}/versions`),
    enabled: !!planId,
  });
}

export function useCreatePlanVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { monthly_price: number; annual_price: number; currency: string } }) =>
      api.post<PlanVersion>(`/api/v1/platform/plans/${id}/versions`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'plans'] }),
  });
}

// ── M11: AutoPay ──────────────────────────────────────────────────────────────
export interface AutoPaySummary {
  active_subscriptions: number;
  enabled: number;
  adoption_pct: number;
  failed_pct: number;
  renewal_success_pct: number;
}

export function useAutoPayAnalytics() {
  return useQuery({
    queryKey: ['platform', 'subscriptions', 'autopay-analytics'],
    queryFn: () => api.get<AutoPaySummary>('/api/v1/platform/subscriptions/autopay-analytics'),
  });
}

export function useSetAutoPay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.post<void>(`/api/v1/platform/subscriptions/${id}/autopay`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform'] }),
  });
}

// tenantUrl — the public URL of a tenant's site from its slug, derived from the apex of the
// current host (platform.ved.test → <slug>.ved.test). `admin: true` → the admin persona host.
export function tenantUrl(slug: string, admin = false): string {
  const host = typeof location !== 'undefined' ? location.hostname : 'platform.ved.test';
  const proto = typeof location !== 'undefined' ? location.protocol : 'http:';
  const parts = host.split('.');
  const base = parts.length > 1 ? parts.slice(1).join('.') : host; // drop the first label (platform/api/…)
  const sub = admin ? `${slug}-admin` : slug;
  return `${proto}//${sub}.${base}`;
}
