// The central router: assembles routes from the aggregated PageDef manifests and
// wraps them in the guard chain (AuthGuard → TenantGuard → AppShell, with
// PermissionGuard per page). Built pages lazy-load their component; planned pages
// render the PlannedPage placeholder. (docs/22-frontend.md)
import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AuthLayout } from '@/app/layouts/AuthLayout';
import { AppShell } from '@/app/layouts/AppShell';
import { AuthGuard } from '@/app/guards/AuthGuard';
import { TenantGuard } from '@/app/guards/TenantGuard';
import { PermissionGuard } from '@/app/guards/PermissionGuard';
import { PlannedPage } from '@/app/PlannedPage';
import { publicPages, protectedPages } from '@/app/pages';
import type { PageDef } from '@/shared/types/page';

function elementFor(page: PageDef): ReactNode {
  let node: ReactNode;
  if (page.status === 'done' && page.element) {
    const Lazy = lazy(page.element);
    node = (
      <Suspense fallback={<div style={{ padding: 24 }}>…</div>}>
        <Lazy />
      </Suspense>
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
              { index: true, element: <Navigate to="/students" replace /> },
              ...protectedPages.map((p) => ({ path: p.path, element: elementFor(p) })),
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
