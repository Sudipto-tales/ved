// Centralised TanStack Query keys so cache invalidation stays consistent across
// features. Each feature adds its namespace here.
export const queryKeys = {
  health: ['health'] as const,
  students: ['students'] as const,
};
