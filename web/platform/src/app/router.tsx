// Control-plane router: assembles routes from the platformPages manifest behind a
// platform-only auth guard + shell. Built pages lazy-load; planned pages show a
// placeholder. SEPARATE from the tenant router (docs/22 App topology).
import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';

import type { PageDef } from '@/shared/types/page';
import { Icon } from '@/shared/ui';
import { platformPages } from '../routes';
import { PlannedPage } from './PlannedPage';
import { PlatformShell } from './PlatformShell';
import { usePlatformAuth } from '../shared/auth';
import LoginPage from '../features/auth/LoginPage';
import LandingPage from '../features/marketing/LandingPage';
import { SignupLayout } from '../features/signup/SignupLayout';
import SignupLandingPage from '../features/signup/SignupLandingPage';
import SignupRegisterPage from '../features/signup/SignupRegisterPage';
import SignupProofPage from '../features/signup/SignupProofPage';
import SignupStatusPage from '../features/signup/SignupStatusPage';

function AuthGuard() {
  const { isAuthed } = usePlatformAuth();
  return isAuthed ? <Outlet /> : <Navigate to="/login" replace />;
}

// Public home ("/"). On the apex (ved.com / ved.test) this is the marketing landing; a
// signed-in superadmin is sent straight to their console.
function HomeRoute() {
  const { isAuthed } = usePlatformAuth();
  return isAuthed ? <Navigate to="/dashboard" replace /> : <LandingPage />;
}

function AuthLayout() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="flex gap-12" style={{ justifyContent: 'center', marginBottom: 18 }}>
          <span className="brand-badge" style={{ width: 36, height: 36 }}><Icon name="layers" size={18} /></span>
          <span style={{ fontSize: 22, fontWeight: 700 }}>VED Platform</span>
        </div>
        <Outlet />
      </div>
    </div>
  );
}

function elementFor(page: PageDef): ReactNode {
  if (page.status === 'done' && page.element) {
    const Lazy = lazy(page.element);
    return (
      <Suspense fallback={<div style={{ padding: 24 }}>…</div>}>
        <Lazy />
      </Suspense>
    );
  }
  return <PlannedPage page={page} />;
}

export const router = createBrowserRouter([
  // PUBLIC marketing landing — the apex front door (ved.test / www.ved.com).
  { path: '/', element: <HomeRoute /> },
  { element: <AuthLayout />, children: [{ path: '/login', element: <LoginPage /> }] },
  // PUBLIC self-registration site — UNAUTHENTICATED, outside the AuthGuard (docs/01).
  {
    element: <SignupLayout />,
    children: [
      { path: '/signup', element: <SignupLandingPage /> },
      { path: '/signup/register', element: <SignupRegisterPage /> },
      { path: '/signup/proof/:id', element: <SignupProofPage /> },
      { path: '/signup/status/:id', element: <SignupStatusPage /> },
    ],
  },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <PlatformShell />,
        children: [
          // "/" is the public landing (HomeRoute); authed admins are routed to /dashboard there.
          ...platformPages.map((p) => ({ path: p.path, element: elementFor(p) })),
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
