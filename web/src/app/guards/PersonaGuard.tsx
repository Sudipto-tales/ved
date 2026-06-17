// Route-level persona gate for the tenant app. The HARD fence is the server (membership-
// type checks + RLS + requirePermission); this is the UX layer. It mirrors the sidebar's
// PERSONAS_FOR mapping (AppShell) so the URL space matches the nav: a user who lands in
// another persona's area is sent to "/" — where PersonaHome routes them to THEIR own home
// (a teacher → /teacher, a student → /student) — instead of seeing a shell that 403s.
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/auth/AuthProvider';
import { useTenant } from '@/shared/tenant/TenantProvider';
import type { Persona } from '@/shared/types/page';

// Which membership user_type may enter each persona's area. EMPLOYEE covers the management
// app (ADMIN + STAFF); finer access there is by permission (PermissionGuard / <Can>).
const USER_TYPES_FOR: Partial<Record<Persona, string[]>> = {
  ADMIN: ['EMPLOYEE'],
  STAFF: ['EMPLOYEE'],
  TEACHER: ['TEACHER'],
  STUDENT: ['STUDENT'],
  GUARDIAN: ['GUARDIAN'],
};

export function PersonaGuard({ persona, children }: { persona: Persona; children: ReactNode }) {
  const { memberships } = useAuth();
  const { activeTenantId } = useTenant();
  const userType = memberships.find((m) => m.tenant_id === activeTenantId)?.user_type ?? 'EMPLOYEE';
  const allowed = USER_TYPES_FOR[persona];
  if (allowed && !allowed.includes(userType)) {
    return <Navigate to="/" replace />; // PersonaHome bounces them to their own area
  }
  return <>{children}</>;
}
