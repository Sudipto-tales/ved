import type { ComponentType } from 'react';

// PageDef is the keystone of the frontend wiring. Every feature exports a manifest
// of PageDefs (its routes.tsx). The central router (app/router.tsx) collects all
// manifests and mounts them behind the guard chain — so routing, RBAC gating, the
// persona a page belongs to, its delivery tier, and its build status are all
// declared in ONE place per page. See docs/22-frontend.md.

/** The role that primarily lands on a page (drives sidebar + default dashboard). */
export type Persona =
  | 'PUBLIC' // unauthenticated (login, reset)
  | 'SUPERADMIN' // platform control-plane app
  | 'ADMIN' // school/college admin
  | 'STAFF' // staff/authority (permission-subset of admin)
  | 'TEACHER'
  | 'STUDENT'
  | 'GUARDIAN';

/** Delivery tier — mirrors the feature catalog (docs/09-feature-catalog.md). */
export type Tier = 'T1' | 'T2' | 'T3';

/** Build status — drives TRACK.md and lets the router skip unbuilt pages. */
export type PageStatus = 'planned' | 'scaffolded' | 'done';

export interface PageDef {
  /** Route path relative to the app root, e.g. "students" or "students/:id". */
  path: string;
  /** Human title for nav + document title. */
  title: string;
  /** Primary persona that lands here. */
  persona: Persona;
  /** RBAC gate — the permission the route requires (docs/05-rbac.md). Omit = any authed user. */
  permission?: string;
  /** Delivery tier. */
  tier: Tier;
  /** Build status. */
  status: PageStatus;
  /** Show in the sidebar nav (vs detail/sub routes). */
  nav?: boolean;
  /** Lazy page component. Undefined until the page is built (status !== 'done'). */
  element?: () => Promise<{ default: ComponentType<unknown> }>;
}

/** Convenience: a feature module exports its pages under this shape. */
export type FeatureManifest = PageDef[];
