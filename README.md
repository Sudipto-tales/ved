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

### Option A — bare localhost (simplest, no DNS setup)

Point the browser straight at the Vite dev server. The tenant is selected by id
(the legacy picker / `X-Tenant-ID`), so set the dev default once:

```bash
# web/.env  (copy from web/.env.example)
VITE_API_URL=http://localhost:8081
VITE_DEV_TENANT_ID=01890000-0000-7000-8000-000000000001
```

| App | URL | Sign in with |
| --- | --- | --- |
| Tenant SPA (school) | http://localhost:5173 | `admin@ved.local` / `admin1234` |
| Node API | http://localhost:8081 | — |
| Platform SPA (superadmin) | http://localhost:5174 | `super@ved.platform` / `super1234` |
| Control plane API | http://localhost:8080 | — |

### Option B — subdomain routing (`*.ved.test`, matches production shape)

The subdomain **is** the tenant — no port-per-school, no picker (see
[`docs/25-subdomain-routing.md`](./docs/25-subdomain-routing.md)). The nginx gateway
(`./ved.sh up`) listens on port **80** and resolves `X-Tenant-Slug` from the host.

Add the hosts entries (or use dnsmasq for `*.ved.test`):

```
# /etc/hosts
127.0.0.1  ved.ved.test  platform.ved.test
```

| Door | URL | Sign in with |
| --- | --- | --- |
| School (everyone) | http://ved.ved.test | `admin@ved.local` / `admin1234` |
| Platform superadmin | http://platform.ved.test | `super@ved.platform` / `super1234` |

> **One login per school.** Everyone signs in at `{slug}.ved.test`; after login the app
> routes by role — admin/staff land on the management app (sidebar filtered by permission),
> teachers at `/teacher`, students at `/student`, guardians at `/guardian`. No separate
> admin URL. See [`docs/25`](./docs/25-subdomain-routing.md).

`{slug}` is the school's slug — the demo tenant's is **`ved`**. New schools provisioned by
the control plane reach VED at `{their-slug}.ved.test` (dev) / `{their-slug}.ved.com` (prod).
