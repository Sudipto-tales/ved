import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api';

export interface Plan {
  id: string;
  name: string;
  tier: string;
  currency: string;
  price: number;
  billing_cycle: string;
  seats: number;
  enabled_modules: string[];
}

// Public plan catalog — the same endpoint the signup site uses.
export function usePlans() {
  return useQuery({
    queryKey: ['platform', 'plans'],
    queryFn: () => api.get<{ plans: Plan[] }>('/api/v1/plans'),
  });
}
