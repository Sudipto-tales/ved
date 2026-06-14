# 15 — Realtime Notifications, Broadcasting & Feedback

Three related capabilities on one shared backbone: **realtime notifications**,
**broadcasting** (platform→schools, school→users), and **feedback** (users→school,
school→platform). All ride the NATS event bus + Redis you already have
([02](./02-architecture.md)).

## Notifications — three delivery planes

| Plane | When | Transport |
|---|---|---|
| **Realtime in-app** | User is actively in the app | **WebSocket** (live push) |
| **Persistent inbox** | Always — badge + history | DB table + unread count |
| **Push (out-of-app)** | App closed / mobile background | **FCM/APNs** (mobile), **Web Push** (browser), Tauri OS notification (desktop) |

A notification is created once, persisted to the inbox, pushed live to online
sessions, and sent via push to offline/mobile targets — driven by user preferences.

## Architecture & tech stack

```
 domain event ──▶ NATS ──▶ notifications service
 (payment.recorded,        - decides recipients + channels (prefs)
  student.enrolled,        - persists to inbox (DB)
  fee.overdue, ...)        - publishes to realtime subject
                           - enqueues push jobs
                                   │
                ┌──────────────────┼─────────────────────┐
                ▼                  ▼                      ▼
        realtime-gateway     push providers         inbox (DB)
        (WebSocket server)   FCM / APNs / Expo /     unread counts
        Redis pub/sub +      Web Push / Tauri        (Redis cache)
        presence (online)
                │
        live WS push to connected clients
```

| Concern | Choice | Why |
|---|---|---|
| WebSocket server (Go) | **coder/websocket** (context-aware) or gorilla/websocket | Holds live client connections |
| Cross-instance fan-out + presence + unread counts | **Redis** pub/sub + sets | Multiple gateway instances stay in sync; "who's online" |
| Event source | **NATS** | Already the domain-event bus ([08](./08-offline-sync.md)) |
| Mobile push | **Expo Push** (wraps FCM/APNs) | You're on Expo — one API for both stores |
| Web push | **Web Push (VAPID)** | Browser notifications when tab closed |
| Desktop | **Tauri notification plugin** | Native OS notifications |

### Local node vs cloud realtime

- **Node runs its own realtime-gateway** for LAN clients → notifications work **fully
  offline** within the school (a fee recorded at the front desk pops on the
  principal's screen with no internet).
- **Cloud realtime** handles cross-tenant and **platform→school** broadcasts.
- Mobile **push** always goes via the cloud providers (needs internet by nature).

### Delivery guarantees

- Inbox is the source of truth; WS/push are best-effort accelerators. A missed live
  push is still in the inbox on next load.
- `notification_log` dedupes (same key never delivered twice) — same idempotency rule
  as sync ([08](./08-offline-sync.md)) and reminders ([11](./11-subscription-billing.md)).

```
notification      (id, tenant_id, recipient_user_id, kind, title, body, data,
                   read_at?, created_at)
notification_pref (user_id, kind, in_app, email, sms, push)   -- per-user channels
device_token      (user_id, platform, token, last_seen)        -- for push
```

## Broadcasting

| Direction | Use | Targeting |
|---|---|---|
| **Platform → tenants** | Release notes, maintenance notices ([14](./14-maintenance-ops.md)), outage alerts, offers | By plan, channel, version, or all schools |
| **Tenant → users** | Notices, announcements, events | By role, class/section, or all staff/parents |

```
broadcast      (id, scope ∈ {PLATFORM, tenant_id}, title, body, audience_filter,
                channels[], scheduled_at?, status, created_by)
broadcast_receipt (broadcast_id, user_id, delivered_at, read_at)
```

- **Scheduled** broadcasts (send at a future time) via the River job queue.
- Delivered through the **same notification planes** (in-app + push + optional
  email/SMS) — broadcasting is just a fan-out producer of notifications, not a
  separate pipe.
- Platform broadcasts ride the **sync hub** down to nodes, so they reach schools even
  if a user only ever uses the offline LAN app.

## Feedback

| Type | From → To |
|---|---|
| **Product feedback** | School users/admin → **platform** (bug, feature request, rating) |
| **Internal feedback** | School staff/parents → **school admin** (suggestions, complaints) |
| **Surveys / NPS** | Platform or school → users |

```
feedback        (id, tenant_id, author_user_id, scope ∈ {PLATFORM, TENANT},
                 category ∈ {BUG, FEATURE, RATING, OTHER}, title, body, rating?,
                 attachments[],            -- screenshots, logs (MinIO)
                 status ∈ {NEW, TRIAGED, PLANNED, IN_PROGRESS, RESOLVED, DECLINED},
                 linked_release_id?,       -- ties resolution to an update
                 created_at)
survey / survey_response (...)             -- NPS / satisfaction
```

- **In-app feedback widget** — category + text + optional **screenshot & log
  attachment** (huge for diagnosing self-hosted node issues).
- Status is tracked and the author is **notified** when it changes (closes the loop).
- Resolved feedback can be **linked to a release** ([13](./13-update-pipeline.md)) so
  release notes can say "you asked, we fixed."
- **NPS/satisfaction surveys** feed the platform health/retention view
  ([11](./11-subscription-billing.md)).

## Why this fits the existing plan

Nothing new infra-wise: **NATS** (events) + **Redis** (fan-out/presence/counts) +
**River** (scheduled/async) + the **sync hub** (offline delivery) are already in the
stack. Notifications, broadcasting, and feedback are **producers/consumers on that
backbone**, plus a thin WebSocket gateway and the push providers.

## Build order

1. Inbox table + notifications service (consume NATS → persist) + unread counts.
2. realtime-gateway (WebSocket + Redis pub/sub + presence) — node and cloud.
3. Notification preferences + dedupe.
4. Push: Expo (mobile), Web Push, Tauri OS notifications + `device_token`.
5. Broadcasting (platform→tenant via sync hub; tenant→users) + scheduling.
6. Feedback widget (with attachments) + status workflow + release linking + surveys.
