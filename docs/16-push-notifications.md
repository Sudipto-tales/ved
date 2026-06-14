# 16 — OS Push Notifications (FCM / APNs)

This is the **out-of-app** delivery plane from [15](./15-notifications-feedback.md):
reaching a user when the app/website is **completely closed**. It complements — does
not replace — the in-app **WebSocket** realtime and the persistent **inbox**.

## How it works

Your backend **never** talks to the device directly. It hands the message to an **OS
push service** — **FCM** (Google, Android + Web) or **APNs** (Apple, iOS) — which
delivers it to the device even with the app closed.

```
domain event ─▶ notifications service ─▶ push dispatcher ─▶ FCM / APNs ─▶ device
   (cloud)            (decide recipients,     (cloud-only)      (Google/      (even if
                       channels, payload)                        Apple)        app closed)
```

## Cost

- **FCM and APNs core infrastructure are free, unlimited.** No per-message cost.
- **Expo Push** (the Expo wrapper over FCM/APNs) is also **free**.
- You pay only if you later adopt a **third-party manager** (OneSignal, Braze) for
  campaign tooling/segmentation at large scale — optional, not needed to start.

## ⚠️ Architectural consequence: push is a CLOUD-plane capability

FCM/APNs are internet services, so **push cannot originate from the offline LAN
node**. This reconciles cleanly with the local-first design ([08](./08-offline-sync.md)):

- **In-LAN, offline:** live alerts use the **node's WebSocket gateway**
  ([15](./15-notifications-feedback.md)) — works with no internet.
- **Out-of-app / mobile / closed app:** the node emits a **push intent** event; it
  rides the **sync hub** up to the cloud **push dispatcher**, which calls FCM/APNs as
  soon as connectivity exists. If the school is fully offline, push simply queues and
  flushes on reconnect — no loss (inbox still holds it).
- **Provider credentials live only in the cloud** (FCM service-account JSON, APNs
  `.p8` auth key). Nodes never hold them.

## Recommended stack (fits your Expo + React + Tauri choices)

| Surface | Use | Notes |
|---|---|---|
| **Web** | **FCM Web SDK** + a browser **Service Worker** (`firebase-messaging-sw.js`) + **VAPID** key | Service worker receives push while the tab/site is closed |
| **Mobile (Expo)** | **Expo Notifications** (Expo push tokens → Expo Push service → FCM/APNs) | One API for both stores; simplest path while you're in Expo |
| **Mobile (rich UI / bare RN later)** | **Notifee** for rich/local display + **@react-native-firebase/messaging** for transport | Adopt if you eject from Expo or need advanced channels/UI |
| **Desktop (Tauri)** | **Tauri notification plugin** (OS notification while running) + WebSocket | True closed-app push on desktop is limited; desktop relies on WS when open + OS notifications |

**Recommendation:** start with **Expo Notifications (mobile) + FCM Web SDK (web)** —
both free, both wrap FCM/APNs. Revisit **OneSignal** only if campaign/segmentation
tooling becomes a real need at scale; the dispatcher abstraction below makes that swap
a backend-only change.

## Device token lifecycle (the part most teams get wrong)

A push token identifies a *device install*, not a user, and it **rotates**. Manage it:

```
device_token (id, user_id, tenant_id, platform ∈ {WEB, IOS, ANDROID},
              provider ∈ {FCM, APNS, EXPO}, token, app_version,
              created_at, last_seen_at, revoked_at?)
```

- **Register** on login *and* after the user grants notification permission.
- **Refresh** when the SDK rotates the token (`onTokenRefresh`) — upsert.
- **Revoke** on logout / permission revoke.
- **Prune** automatically: when FCM/APNs returns *unregistered/invalid token* on a
  send, mark that token revoked. This keeps the registry clean and delivery rates high.
- One user can have **many tokens** (phone + laptop + tablet) → fan a push to all.

## Payload design

- Prefer **data messages** with your own routing fields (`kind`, `entity_id`,
  `deep_link`) so tapping a notification opens the right screen (e.g. a fee receipt).
- Set **priority** (high for time-sensitive like fee-due, normal otherwise) and a
  **collapse key** so repeated updates replace rather than stack.
- Respect `notification_pref.push` per user/kind ([15](./15-notifications-feedback.md))
  — never push a kind the user muted.

## Web specifics

- A **Service Worker** (`firebase-messaging-sw.js`) handles background pushes and
  shows the OS notification; foreground messages are handled by an in-page listener.
- Requires **HTTPS** and a user **permission prompt** (request it contextually, not on
  first load).
- Uses a **VAPID** key pair (public key in the client, private key server-side).

## Dispatcher abstraction (so providers are swappable)

```
PushDispatcher.send(userIds, payload):
    tokens = device_token.active_for(userIds)
    group tokens by provider (FCM | APNS | EXPO)
    call the provider adapter; record results in push_dispatch
    on invalid-token error → revoke that device_token
```

```
push_dispatch (id, notification_id, device_token_id, provider, status,
               provider_msg_id?, error?, sent_at)   -- delivery audit
```

One internal interface, provider adapters behind it. Adding/replacing OneSignal later
= a new adapter, no change to callers.

## Security & privacy

- Provider keys (FCM service account, APNs `.p8`) stored as secrets in the **cloud
  only**, rotated periodically.
- Tokens scoped per **tenant + user**; never reuse across tenants.
- Push **payloads carry no sensitive data** — send identifiers/titles, fetch details
  in-app over the authenticated API (a notification can land on a lock screen).

## Where it slots in

This is the **push** column of the three-plane model in
[15](./15-notifications-feedback.md). Build order, appended to that doc's step 4:

1. `device_token` registry + register/refresh/revoke/prune lifecycle.
2. Cloud **push dispatcher** + FCM and APNs (via Expo) adapters + `push_dispatch` log.
3. Web: FCM Web SDK + service worker + VAPID + contextual permission prompt.
4. Mobile: Expo Notifications token flow + deep-link handling.
5. Node **push-intent → sync-hub → cloud dispatcher** path (offline-safe).
6. (Optional, at scale) OneSignal adapter behind the dispatcher.
