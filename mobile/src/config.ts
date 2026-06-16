// Where the node API lives. Native apps can't use the subdomain gateway (no DNS), so the
// app talks to the node directly and names the tenant with the X-Tenant-Slug header (the
// same header nginx injects on the web — docs/25). The base URL depends on where you run:
//
//   Android emulator → http://10.0.2.2:<NODE_PORT>   (10.0.2.2 = the host machine)
//   iOS simulator    → http://localhost:<NODE_PORT>
//   Physical device  → http://<your-LAN-IP>:<NODE_PORT>   (same Wi-Fi as the dev machine)
//
// NODE_PORT is 8091 in this repo's .env. The login screen lets you override this at runtime,
// so this is only the prefilled default.
export const DEFAULT_SERVER_URL = 'http://10.0.2.2:8091';

// A convenient default tenant for local demo data (./ved.sh seed-demo creates it).
export const DEFAULT_SLUG = 'lincoln';
