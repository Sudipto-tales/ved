# VED Guardian — mobile app (Expo)

The read-heavy **guardian** app (M7): one login → all your linked children, with their
attendance, marks, and fee dues. It reuses the node's guardian portal read-API (the same
contract the web app consumes) — every read is restricted server-side to the caller's own
children (`guardian_student` + RLS).

Stack: **Expo SDK 51 + React Native + TypeScript**, React Navigation (native-stack),
TanStack Query, `expo-secure-store` for the session.

## Run it

```bash
cd mobile
npm install
npm start          # then press a (Android), i (iOS), or scan the QR with Expo Go
npm run typecheck  # tsc --noEmit
```

The node must be running (`./ved.sh up` from the repo root) and reachable from the device.

### Server URL (important)

Native apps don't use the subdomain gateway, so the app calls the node directly and names
the tenant with the `X-Tenant-Slug` header. Set the **Server** field on the login screen to
match where you run:

| Target | Server URL |
|---|---|
| Android emulator | `http://10.0.2.2:8091` (default) |
| iOS simulator | `http://localhost:8091` |
| Physical device (Expo Go) | `http://<your-LAN-IP>:8091` (same Wi-Fi) |

`8091` is `NODE_PORT` from the repo `.env`.

### Credentials

Use a **guardian** login (a contact promoted to a portal user — docs/18). Seed demo data
with `./ved.sh seed-demo`, then promote a guardian via the web app or the
`POST /students/guardians/{id}/promote` endpoint to get a guardian handle + temp password.
`School code` is the tenant slug (e.g. `lincoln`).

## What's here

```
src/
  api/client.ts        fetch wrapper: Bearer token + X-Tenant-Slug; login() is cross-tenant
  api/guardian.ts      typed guardian reads + react-query hooks (children/attendance/marks/fees)
  auth/AuthContext.tsx  persisted { serverUrl, slug, token } session (secure-store)
  navigation/          native-stack + auth gate
  screens/             Login, Dashboard (child switcher), ChildAttendance/Marks/Fees
  components/ui.tsx    tiny presentational kit (Minimal Tech palette)
```

## Not yet (carried forward)

Tier-2 writes on mobile (pay / leave / contact — the endpoints exist, the web app uses
them), push notifications (docs/16), refresh-token rotation, and an app icon/splash asset.
