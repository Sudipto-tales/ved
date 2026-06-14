# VED Web (tenant app)

React + Vite + TypeScript, wrapped by Tauri for desktop. Mirrors the backend slices
1:1. Full design rationale: [docs/22-frontend.md](../docs/22-frontend.md).

## Run

```bash
# via Docker (with the rest of the stack)
./ved.sh up            # from repo root — serves on http://localhost:5173

# or standalone
cd web && npm install && npm run dev
```

The skeleton login takes a **tenant id** (any UUID) — it becomes your `X-Tenant-ID`
and a wildcard dev session, so every route is reachable. The **Notes (demo)** page
round-trips to the `node` backend, proving FE → API client → DB → outbox.

## Architecture (why it's shaped this way)

- **Feature-sliced.** `src/features/<slice>` mirrors a backend slice and owns its full
  vertical: `pages/` · `components/` · `api/` (typed hooks over `shared/api`) ·
  `routes.tsx` (the page manifest). A feature never imports another feature's
  internals — cross-feature needs go through `shared/`.
- **Data-driven routing.** Each feature exports a `PageDef[]` manifest. `app/pages.ts`
  aggregates them; `app/router.tsx` mounts them behind the guard chain
  (`AuthGuard → TenantGuard → AppShell`, `PermissionGuard` per page). Add a page to a
  manifest and it appears in the router and the sidebar automatically.
- **Shared kernel** (`src/shared`): `ui/` (design kit) · `api/` (the one HTTP client +
  query keys) · `auth/` (session + permissions) · `tenant/` (active tenant → header) ·
  `authz/` (`<Can>` + `usePermission`) · `config` · `lib` · `types`.
- **The seams** (auth, tenant, RBAC, API contract) live in `shared/` and are
  established once; see [docs/plan/bridges.md](../docs/plan/bridges.md).

## Layout

```
src/
  app/        router, providers, layouts, guards, page aggregator
  shared/     ui · api · auth · tenant · authz · config · lib · types
  features/   auth · onboarding · students · teachers · staff · guardians ·
              academics · finance · access · admin · communication · reports ·
              learning · notes(demo)        ← see features/README.md
platform/     SEPARATE control-plane (superadmin) build
```

Progress against the build plan is tracked in [../TRACK.md](../TRACK.md).
