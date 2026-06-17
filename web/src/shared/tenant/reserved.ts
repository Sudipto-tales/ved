// Slugs that can never belong to a school — they collide with the routing namespace
// (platform/www/api/...) or with reserved subdomains we serve ourselves (docs/25).
// Keep this in sync with reservedSlugs in
// server/internal/features/registration/registration.go (the authoritative check).
export const RESERVED_SLUGS = new Set([
  'platform', 'www', 'app', 'api', 'admin',
  'console', 'ops', 'status', 'support', 'help',
  'docs', 'blog', 'mail', 'smtp', 'ftp',
  'cdn', 'static', 'assets', 'auth', 'login',
  'signup', 'register', 'dashboard', 'node',
  'controlplane', 'control-plane', 'ved',
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
