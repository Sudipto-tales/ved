# VED

Local-first school & college management platform. A single Go binary + Postgres runs on a
school's LAN (offline-capable), synced to a central control plane over NATS/JetStream.

- **Architecture & decisions:** see [`docs/`](./docs) (numbered `01`–`25`).
- **Build status:** see [`TRACK.md`](./TRACK.md) — the whole phased build **M0→M8 is done**.

---

## Quick start

```bash
./ved.sh up infra   # Postgres, Redis, NATS, MinIO (Docker Compose)
./ved.sh up         # + node API, control plane, web SPAs, nginx gateway
./ved.sh stop       # tear everything down
```

On first startup the node **seeds a demo tenant** so you can log in immediately
(idempotent — safe on every boot).

---

## Login — domains & passwords

### Dev credentials (seeded automatically)

| Who | Login / email | Password |
| --- | --- | --- |
| **School admin** (tenant plane) | `admin@ved.local` | `admin1234` |
| **Platform superadmin** (control plane) | `super@ved.platform` | `super1234` |

> ⚠️ Dev seed only — see `server/internal/features/identity/seed.go` and
> `server/internal/features/platform/seed.go`. Do not use these in production.

**Demo tenant:** slug `ved` · "VED Demo School" · id `01890000-0000-7000-8000-000000000001`

### Option A — subdomain routing (recommended; matches production)

The subdomain **is** the tenant — no port-per-school, no picker, **no CORS** (the SPA and
API are same-origin), and the API base is just the domain: **`{slug}.ved.test/api/v1/...`**
(see [`docs/25`](./docs/25-subdomain-routing.md)). The nginx gateway (`./ved.sh up`) listens
on port **80** and resolves `X-Tenant-Slug` from the host. This is exactly how production
behaves (`{slug}.ved.com/api/v1`), so what you test is what you ship.

Add the hosts entries (or use dnsmasq for `*.ved.test`):

```
# /etc/hosts
127.0.0.1  ved.test  ved.ved.test  platform.ved.test
```

| Door | URL | API base | Sign in with |
| --- | --- | --- | --- |
| Marketing landing + signup | http://ved.test | — | — (public) |
| School (everyone) | http://ved.ved.test | `ved.ved.test/api/v1` | `admin@ved.local` / `admin1234` |
| Platform superadmin | http://platform.ved.test | `platform.ved.test/api/v1` | `super@ved.platform` / `super1234` |

> **One login per school.** Everyone signs in at `{slug}.ved.test`; after login the app
> routes by role — admin/staff land on the management app (sidebar filtered by permission),
> teachers at `/teacher`, students at `/student`, guardians at `/guardian`. No separate
> admin URL. See [`docs/25`](./docs/25-subdomain-routing.md).

`{slug}` is the school's slug — the demo tenant's is **`ved`**. New schools provisioned by
the control plane reach VED at `{their-slug}.ved.test` (dev) / `{their-slug}.ved.com` (prod).

### Option B — bare localhost (fallback; no DNS setup)

When you don't want to touch `/etc/hosts`, hit the Vite dev server directly. There's no
subdomain, so the tenant is chosen by id (`X-Tenant-ID`) — set the dev default once:

```bash
# web/.env  (copy from web/.env.example)
VITE_API_URL=http://localhost:8091
VITE_DEV_TENANT_ID=01890000-0000-7000-8000-000000000001
```

| App | URL | Sign in with |
| --- | --- | --- |
| Tenant SPA (school) | http://localhost:5173 | `admin@ved.local` / `admin1234` |
| Node API | http://localhost:8091/api/v1 | — |
| Platform SPA (superadmin) | http://localhost:5174 | `super@ved.platform` / `super1234` |
| Control plane API | http://localhost:8080/api/v1 | — |

> The frontend picks the base automatically: on a `ved.*` host it uses the same-origin
> `/api/v1` path; on bare localhost it falls back to `VITE_API_URL`. The node listens on
> **8091** (`NODE_PORT`); the control plane on **8080**.
