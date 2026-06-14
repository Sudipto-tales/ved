// Composes the global providers (query client, auth, tenant) around the router.
// This is the single <App> the entry point renders.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/shared/auth/AuthProvider';
import { TenantProvider } from '@/shared/tenant/TenantProvider';
import { GlobalStyles } from '@/shared/ui';
import { router } from '@/app/router';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalStyles />
      <AuthProvider>
        <TenantProvider>
          <RouterProvider router={router} />
        </TenantProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
