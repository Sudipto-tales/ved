# Component Bridges

A **bridge** is a seam where two components meet, plus the *contract* that holds the
seam stable. Freeze the contract and both sides build independently: the FE team and
BE team work in parallel, one slice ships without reaching into another, and a node
syncs with the cloud without either knowing the other's internals. Every rule below
exists to keep the seam decoupled — change one side freely as long as the contract
holds.

Each section names the **two sides**, states the **contract** in a fenced block, and
gives the **rule** that prevents coupling.

---

## 1. Client ↔ Backend

**Sides:** React/Vite + Tauri + Expo clients · Go HTTP slices (Chi).

```
OpenAPI spec (per slice)  ──┬─→ generated TS client   (web / desktop / mobile)
   = single source of truth │   + Zod schemas (FE validation)
                            └─→ Go handlers + go-playground/validator (BE)
```

The spec defines paths, params, request/response shapes, and error codes. The TS
client is **generated** from it; Zod (FE) and `go-playground/validator` (BE) validate
the same shapes from the same source. Three clients, one contract.

**Rule:** Clients never hand-roll HTTP — they call the generated client only. The
OpenAPI contract for a slice is **frozen before parallel FE/BE work begins**; changing
a shape means changing the spec and regenerating, not editing a fetch call.

Cross-reference: [02](../02-architecture.md) (OpenAPI → TS client, validation both ends).

---

## 2. Auth Bridge

**Sides:** client-held tokens · the JWT auth middleware (first in the chain).

```
client → Authorization: Bearer <access-jwt>
auth mw verifies → resolves { user_id, memberships[] }
access JWT claims:  sub=user_id, memberships, exp (short-lived)
refresh JWT:        long-lived, rotates the access token
must_reset_password flag → force password reset on first login
```

The token carries identity and the user's memberships; it does **not** carry an active
tenant or a permission set — those are resolved downstream (bridges 3 and 4). A freshly
provisioned user logs in with a generated credential and is forced to reset on first
login.

**Rule:** Slices never parse JWTs or trust client-supplied identity; they read the
`user_id`/`memberships` the middleware resolved. Token shape is the contract — change
claims in the middleware, not in handlers.

Cross-reference: [02](../02-architecture.md) (request path), [03](../03-multi-tenancy.md)
(users vs memberships).

---

## 3. Tenant-Context Bridge

**Sides:** the tenant-context middleware · every tenant-scoped query, via Postgres RLS.

```
tenant mw resolves active tenant (from membership + chosen tenant)
  → SET app.tenant_id = '<uuid>'        -- on the request's DB session
RLS policy on every table:
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
```

The middleware sets one session variable; RLS enforces isolation at the DB layer, so a
forgotten `WHERE tenant_id = ?` is still safe and no query can return another tenant's
rows. On a node, isolation is also physical (one tenant per node).

**Rule:** Every tenant-scoped query **trusts the session var** — no slice passes
`tenant_id` by hand or filters on it in application code. The seam is the session
variable, not a function parameter.

Cross-reference: [03](../03-multi-tenancy.md) (RLS, `app.tenant_id`).

---

## 4. RBAC Bridge

**Sides:** the `requirePermission` middleware · the slice handler behind it.

```
route → requirePermission("fee.record") → handler
effective permissions = union over the membership's roles
tenant.admin short-circuits to "all within this tenant"
permissions = fixed, code-defined catalog (e.g. student.onboard, payment.record)
```

The gate sits between transport and slice. Handlers declare the permission they need;
the middleware computes effective permissions from the membership's roles and lets the
request through or rejects it before any slice code runs.

**Rule:** Permissions are a **closed catalog defined in code** — roles are dynamic
bundles, but the strings handlers check are fixed. Handlers declare a required
permission; they never inspect roles or designations to authorize.

Cross-reference: [05](../05-rbac.md) (catalog, role/permission separation).

---

## 5. Slice ↔ Slice Bridge

**Sides:** any two feature slices (e.g. `academics` · `teachers`).

```
ALLOWED:  academics → teachers.GetTeacher(id)      (explicit service call)
ALLOWED:  academics subscribes to teacher.onboarded (domain event)
FORBIDDEN: academics SELECT ... FROM teachers       (reaching into tables)
```

A `teaching_assignment` in `academics` references a teacher **by id** and resolves
details through the `teachers` service interface (or reacts to a teacher event) — it
never joins the `teachers` tables. Each slice owns its tables; others see only its
published interface and events.

**Rule:** Slices integrate via (a) explicit service interfaces or (b) domain events —
**never** by reading another slice's tables. Owning a foreign key (`teacher_id`) is
fine; querying the foreign table is not.

Cross-reference: [04](../04-vertical-slicing.md) (slices talk via events/service calls).

---

## 6. Event / Outbox Bridge

**Sides:** an event producer (a slice mutation) · any consumer (sync hub, notifications,
reporting).

```
one DB transaction:
  INSERT/UPDATE domain row (tenant_id, UUIDv7 PK, hlc, version, origin_node_id)
  INSERT outbox (aggregate, op, payload, hlc, …)
  INSERT audit_log
relay (async) → JetStream subject:  tenant.<tenant_id>.<aggregate>.<op>
                                     e.g. tenant.<uuid>.payment.recorded
delivery = at-least-once  →  inbox dedupes by event id (idempotent apply)
```

Domain row and outbox row commit together, so no change exists without its event. The
relay publishes after commit; consumers apply through an inbox that drops duplicates.

**Rule:** The payload schema is **versioned**; producers and consumers are decoupled —
a consumer subscribes to a subject and a payload version, never to the producer's code
or tables. Add fields compatibly; bump the version for breaking changes.

Cross-reference: [20](../20-dataflow.md) (write path, envelope), [08](../08-offline-sync.md)
(outbox/inbox/idempotency).

---

## 7. Node ↔ Cloud Sync Bridge

**Sides:** the per-school node · the central cloud sync hub.

```
NODE  outbox ─relay→ JetStream(tenant.<id>.*) ─→ inbox  CLOUD (event history backup)
NODE  inbox  ←apply─ JetStream ←─────── cloud outbox     CLOUD (config push-down)

Node → Cloud:  business events (students, attendance, fees, marks, audit)
Cloud → Node:  license, tenant config, onboarding templates, permission-catalog
               updates, software-update signals
transport: mTLS (per-node cert + node_id) · per-tenant subject scoping
conflicts: HLC per-field LWW; ledgers/marks/attendance append-only & summed
```

Both directions are relay (outbox → JetStream) + consumer (JetStream → inbox). The node
is the operational source of truth; the cloud holds durable per-tenant history and
pushes control/config down. A days-offline node replays from its JetStream cursor.

**Rule:** What flows each way is the contract (table above). A node can only
publish/subscribe to **its own tenant's subjects** — per-tenant scoping plus mTLS means
no cross-tenant leakage even on the wire. Neither side touches the other's database.

Cross-reference: [08](../08-offline-sync.md) (sync pillars, what flows which way, security).

---

## 8. Shared-Kernel Bridge

**Sides:** any slice · the `platform/` shared kernel.

```
slice depends on INTERFACES, not impls:
  tenancy   · events   · audit   · storage
  authz     · credential/slug generator
platform/ provides the concrete wiring (pgx, NATS, MinIO, …)
```

Cross-cutting concerns live in `platform/` behind small interfaces. A slice asks for an
event publisher or a storage client; the kernel supplies the real one in production and
a fake in tests.

**Rule:** Slices depend on the **kernel's interfaces, not its concrete implementations**
— which keeps slices unit-testable (swap a fake) and the platform swappable (e.g. MinIO
→ S3) without touching slice code.

Cross-reference: [02](../02-architecture.md) (shared kernel), [04](../04-vertical-slicing.md)
(kernel is not a slice).

---

See the plan index: [README.md](./README.md).
