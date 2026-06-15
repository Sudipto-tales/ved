# 25 — Subdomain Routing & Simplified Login

How a school reaches VED by its **own subdomain**, why there is **no port (or build) per
tenant**, and how this removes the tenant picker + CORS. Pairs with
[24 — Login & Registration](./24-login-and-registration.md).

---

## 1. Principle: one app, many subdomains (not a port per tenant)

There is **one** tenant SPA bundle and **one** node API serving every school. A subdomain
is a *runtime identity hint* — it tells the app/API which tenant a request is for; the
data is isolated by `tenant_id` + RLS, not by port or process. Spinning up a Vite port
(5175, 5176…) per school would mean N builds, N deploys, and buys nothing.

> The only time a school gets its *own* process is the **local-first node** model (each
> school runs its own node binary + Postgres on its LAN — [08](./08-offline-sync.md)).
> Even then nginx routes by **hostname**, never by the browser hitting different ports.

## 2. URL scheme

| Audience | Local | Production |
|---|---|---|
| Everyone in a school (student/teacher/guardian/staff) | `{slug}.ved.test` | `{slug}.ved.com` |
| School admin | `{slug}-admin.ved.test` | `{slug}-admin.ved.com` |
| Platform superadmin | `platform.ved.test` | `platform.ved.com` |
| Marketing + self-signup | `ved.test` (apex) | `www.ved.com` |

`{slug}` is the school's immutable tenant slug (e.g. `lincoln`). A single wildcard cert
`*.ved.com` covers both `lincoln.ved.com` and `lincoln-admin.ved.com` (both one label
deep) — no per-tenant certificates.

## 3. Request flow

```
browser → lincoln.ved.test ─► nginx (server_name *.ved.test)
    /            → the ONE tenant SPA  (Vite dev :5173 in dev · static bundle in prod)
    /api/*, /auth/* , /healthz → node :8091   (SAME ORIGIN ⇒ no CORS)
                     nginx sets  X-Tenant-Slug: lincoln   (captured from the host)
                          │
                          ▼
   node: resolve slug → tenant_id (SECURITY DEFINER tenant_id_by_slug), SET app.tenant_id,
   then the existing tenant-context check still verifies the JWT membership includes it.
```

Two wins fall out: **CORS disappears** (SPA + API are same-origin), and the **tenant is
known before login** (from the host).

## 4. Simplified login

Because the subdomain *is* the tenant:
- `lincoln.ved.test` → the login screen already knows the school. The user types
  **username + password only** — no tenant picker, no `X-Tenant-ID` to choose. After auth
  the app operates in that tenant; if the user has no membership there, API calls return
  403 → "no access".
- A multi-school person visits each school's subdomain.
- `lincoln-admin.ved.test` → the **same** bundle, an "admin" entry (branding/landing); a
  non-admin who signs in is bounced. (The app already routes by `user_type`, so the admin
  subdomain is a focused door, not a separate build.)
- `platform.ved.test` → the platform SPA (superadmin, separate namespace).

## 5. How tenant is resolved (the contract)

The node's tenant-context middleware accepts **either** header, in priority order:
1. `X-Tenant-Slug` (set authoritatively by nginx from the subdomain; also sent by the SPA
   in dev) → resolved to `tenant_id` via the `tenant_id_by_slug(text)` **SECURITY DEFINER**
   function (the one narrow, audited RLS bypass — mirrors `auth_memberships`).
2. `X-Tenant-ID` (explicit uuid — kept for API clients, tests, and bare-localhost dev with
   the legacy picker).

Either way it then **authorises**: the chosen tenant must be one of the caller's JWT
memberships, else 403. RLS still enforces isolation at the DB underneath.

## 6. Local setup (dnsmasq + nginx)

`/etc/hosts` can't wildcard, so use **dnsmasq** for the reserved `.test` TLD:
```
# /etc/dnsmasq.d/ved-test.conf   (then restart dnsmasq; ensure 127.0.0.1 is your resolver)
address=/ved.test/127.0.0.1
```
Minimal alternative (no dnsmasq) — add explicit hosts entries per school:
```
# /etc/hosts
127.0.0.1  lincoln.ved.test  lincoln-admin.ved.test  maple.ved.test  platform.ved.test
```
**nginx** (committed at `deploy/nginx/ved.test.conf`) reverse-proxies to the existing dev
servers — tenant subdomains → the tenant SPA + node API; `platform.` → the platform SPA +
control plane. In dev it's run as a container (`./ved.sh up` includes it); it proxies to
`web:5173`, `node:8081` (container port), `controlplane:8080` on the compose network.

## 7. Production (`*.ved.com`)

- Wildcard DNS `*.ved.com` → the load balancer; wildcard TLS `*.ved.com`.
- Same nginx/ingress pattern; `location /` serves the built static bundle (`root …`),
  `/api`/`/auth` proxy to the node service.
- The control plane + signup live on `platform.ved.com` / `www.ved.com`.

## 8. Code touch-points (this slice)

- **DB:** migration `00011` — `tenant_id_by_slug(text)` SECURITY DEFINER, `EXECUTE` to `ved_app`.
- **Backend:** `httpx.TenantContext(resolve)` resolves `X-Tenant-Slug`→id (or `X-Tenant-ID`),
  then the existing membership authorisation; `cmd/node` wires the resolver over the pool.
- **Frontend:** `shared/tenant/host.ts` derives `{slug, admin}` from the hostname and the
  API base (relative on `*.ved.test`/`*.ved.com`); the API client sends `X-Tenant-Slug`;
  `TenantProvider`/`TenantGuard` treat a subdomain as an active tenant (no picker);
  `useAuthFlow` skips the picker in subdomain mode; the login page shows the school.
- **Infra:** `deploy/nginx/ved.test.conf`, dnsmasq snippet, an `nginx` compose service.

## Cross-references
- Login points & registration — [24](./24-login-and-registration.md)
- Multi-tenancy / RLS — [03](./03-multi-tenancy.md) · local-first nodes — [08](./08-offline-sync.md)
- Frontend apps & personas — [22](./22-frontend.md)
