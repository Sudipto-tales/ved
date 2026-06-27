// Platform shares the PageDef contract with the tenant app.
import type { PageDef } from '../../src/shared/types/page';

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL-PLANE (platform superadmin) route manifest.
//
// This is a SEPARATE build from the tenant app — the superadmin spans every
// tenant and must never share a bundle or route guard with tenant code
// (docs/22-frontend.md "App topology"). app/router.tsx for THIS app aggregates
// these manifests behind its own AuthGuard → PermissionGuard chain.
//
// NOTE: control-plane permissions are a SEPARATE namespace from tenant
// permissions. A tenant `access` role/permission grants nothing here; the
// platform has its own permission set (docs/02-architecture.md, docs/05-rbac.md).
// All pages are persona 'SUPERADMIN'. No `element` yet — every page is 'planned'.
// ─────────────────────────────────────────────────────────────────────────────

export const platformPages: PageDef[] = [
  // ── T1: the manual onboarding + verification + tenant-ops core (docs/01, docs/11)
  {
    path: 'dashboard',
    title: 'Dashboard',
    persona: 'SUPERADMIN',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./features/dashboard/DashboardPage'),
  },
  {
    path: 'registrations',
    title: 'Registrations',
    persona: 'SUPERADMIN',
    permission: 'platform.registration.review',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./features/registrations/RegistrationsPage'),
  },
  {
    // Approve / reject a pending school registration (docs/01 state machine).
    path: 'registrations/:id',
    title: 'Registration Review',
    persona: 'SUPERADMIN',
    permission: 'platform.registration.review',
    tier: 'T1',
    status: 'done',
    element: () => import('./features/registrations/RegistrationDetailPage'),
  },
  {
    path: 'payment-proofs',
    title: 'Payment Proofs',
    persona: 'SUPERADMIN',
    permission: 'platform.payment.review',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./features/payment-proofs/PaymentProofsPage'),
  },
  {
    // approve | reject(reason) on a payment submission (docs/11).
    path: 'payment-proofs/:id',
    title: 'Payment Proof Review',
    persona: 'SUPERADMIN',
    permission: 'platform.payment.review',
    tier: 'T1',
    status: 'done',
    element: () => import('./features/payment-proofs/PaymentProofDetailPage'),
  },
  {
    path: 'tenants',
    title: 'Tenants',
    persona: 'SUPERADMIN',
    permission: 'platform.tenant.manage',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./features/tenants/TenantsPage'),
  },
  {
    // Provision / suspend / offboard a single tenant (docs/01, docs/11).
    path: 'tenants/:id',
    title: 'Tenant Detail',
    persona: 'SUPERADMIN',
    permission: 'platform.tenant.manage',
    tier: 'T1',
    status: 'done',
    element: () => import('./features/tenants/TenantDetailPage'),
  },

  // ── T2/T3: monetization, entitlements, insight, support (docs/11)
  {
    // MRR/ARR, churn, revenue trend, plan popularity — the subscription analytics dashboard.
    path: 'subscriptions',
    title: 'Subscriptions',
    persona: 'SUPERADMIN',
    permission: 'platform.subscription.manage',
    tier: 'T2',
    status: 'done',
    nav: true,
    element: () => import('./features/subscriptions/SubscriptionsPage'),
  },
  {
    // Issued signed licenses — view / revoke (docs/01, docs/11 enforcement token).
    path: 'licenses',
    title: 'Licenses',
    persona: 'SUPERADMIN',
    permission: 'platform.license.manage',
    tier: 'T2',
    status: 'done',
    nav: true,
    element: () => import('./features/licenses/LicensesPage'),
  },
  {
    path: 'support',
    title: 'Support Console',
    persona: 'SUPERADMIN',
    permission: 'platform.support.manage',
    tier: 'T3',
    status: 'done',
    nav: true,
    element: () => import('./features/support/SupportPage'),
  },
  {
    // One ticket: full message thread + reply + status controls.
    path: 'support/:id',
    title: 'Support Ticket',
    persona: 'SUPERADMIN',
    permission: 'platform.support.manage',
    tier: 'T3',
    status: 'done',
    element: () => import('./features/support/SupportDetailPage'),
  },

  // ── System: app distribution + platform configuration
  {
    // Upload / register desktop + mobile builds and publish them to the download list.
    path: 'releases',
    title: 'App Releases',
    persona: 'SUPERADMIN',
    permission: 'platform.tenant.manage',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./features/releases/ReleasesPage'),
  },
  {
    // Platform configuration — collapsible cards for credentials, endpoints, integrations.
    path: 'settings',
    title: 'Settings',
    persona: 'SUPERADMIN',
    permission: 'platform.tenant.manage',
    tier: 'T1',
    status: 'done',
    nav: true,
    element: () => import('./features/settings/SettingsPage'),
  },
];
