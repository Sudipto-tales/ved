// Shared post-authentication routing: where does the user land after a successful
// login or password reset? One membership → straight into the app; several → the
// tenant picker; none → a friendly dead-end. Used by LoginPage and ResetPasswordPage
// so the flow is identical from both entry points.
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type Membership } from '@/shared/auth/AuthProvider';
import { useTenant } from '@/shared/tenant/TenantProvider';

export function useAuthFlow() {
  const navigate = useNavigate();
  const { mustReset } = useAuth();
  const { setTenant } = useTenant();

  // Call after a session is stored. Honours the forced-reset gate first.
  return useCallback(
    (memberships: Membership[], freshMustReset?: boolean) => {
      if (freshMustReset ?? mustReset) {
        navigate('/reset-password', { replace: true });
        return;
      }
      if (memberships.length === 1) {
        setTenant(memberships[0].tenant_id);
        navigate('/', { replace: true });
        return;
      }
      if (memberships.length === 0) {
        navigate('/no-access', { replace: true });
        return;
      }
      navigate('/select-tenant', { replace: true });
    },
    [navigate, setTenant, mustReset],
  );
}
