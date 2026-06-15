import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { GlobalStyles } from '@/shared/ui';
import { PlatformAuthProvider } from '../shared/auth';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalStyles />
      <PlatformAuthProvider>
        <RouterProvider router={router} />
      </PlatformAuthProvider>
    </QueryClientProvider>
  );
}
