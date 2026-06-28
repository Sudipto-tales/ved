// The central router: assembles routes from the aggregated PageDef manifests and
// wraps them in the guard chain (AuthGuard → TenantGuard → AppShell, with
// PermissionGuard per page). Built pages lazy-load their component; planned pages
// render the PlannedPage placeholder. (docs/22-frontend.md)
import { Component, lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Spinner } from '@/shared/ui';

import { PersonaHome } from '@/app/PersonaHome';

// A page's code is lazy-loaded. In dev, Vite re-optimizes dependencies when new modules are
// added, which invalidates the chunk URLs an already-open tab is holding — so a navigation
// can reject with "Failed to fetch dynamically imported module" and the bare <Suspense>
// fallback would hang forever ("stuck on loading"). This boundary catches that: on a
// chunk-load error it self-heals with a ONE-TIME reload (guarded against loops); any other
// error shows a Reload affordance instead of an endless spinner.
const isChunkError = (e: unknown) =>
  /dynamically imported module|module script failed|Importing a module|ChunkLoadError/i.test(String((e as Error)?.message ?? e));

class LazyBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (isChunkError(error) && typeof window !== 'undefined' && !sessionStorage.getItem('ved.chunkReload')) {
      sessionStorage.setItem('ved.chunkReload', '1');
      window.location.reload();
    }
  }
  render() {
    if (this.state.failed) {
      return (
        <div style={{ padding: 24 }}>
          <p style={{ marginBottom: 12 }}>This page couldn’t load. It may be a stale tab after an update.</p>
          <button className="btn" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { AuthLayout } from '@/app/layouts/AuthLayout';
import { AppShell } from '@/app/layouts/AppShell';
import { AuthGuard } from '@/app/guards/AuthGuard';
import { TenantGuard } from '@/app/guards/TenantGuard';
import { PermissionGuard } from '@/app/guards/PermissionGuard';
import { PersonaGuard } from '@/app/guards/PersonaGuard';
import { PlannedPage } from '@/app/PlannedPage';
import { publicPages, protectedPages } from '@/app/pages';
import type { PageDef } from '@/shared/types/page';

function elementFor(page: PageDef): ReactNode {
  let node: ReactNode;
  if (page.status === 'done' && page.element) {
    const Lazy = lazy(page.element);
    node = (
      <LazyBoundary>
        <Suspense fallback={<div style={{ padding: 24, display: 'grid', placeItems: 'center', minHeight: 200 }}><Spinner /></div>}>
          <Lazy />
        </Suspense>
      </LazyBoundary>
    );
  } else {
    node = <PlannedPage page={page} />;
  }
  if (page.permission) {
    node = <PermissionGuard permission={page.permission}>{node}</PermissionGuard>;
  }
  return node;
}

export const router = createBrowserRouter([
  // Public (unauthenticated) routes.
  {
    element: <AuthLayout />,
    children: publicPages.map((p) => ({ path: `/${p.path}`, element: elementFor(p) })),
  },
  // Authenticated, tenant-scoped routes inside the app shell.
  {
    element: <AuthGuard />,
    children: [
      {
        element: <TenantGuard />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <PersonaHome /> },
              ...protectedPages.map((p) => ({
                path: p.path,
                element: <PersonaGuard persona={p.persona}>{elementFor(p)}</PersonaGuard>,
              })),
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
