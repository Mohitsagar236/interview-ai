# Vercel Deployment

Vercel is used only for the public website, installer download redirect, and
anonymous usage analytics.
The desktop app runs locally on the user's machine.

## Required Environment Variables

| Variable | Purpose |
| --- | --- |
| `R2_PUBLIC_URL` | Public base URL where release installers are hosted |
| `APP_VERSION` | Installer version, for example `0.1.0` |
| `APP_BUILD_ID` | Build identifier appended to the installer URL |
| `ADMIN_TOKEN` | Secret token required to open `/admin.html` |

No Supabase, Razorpay, activation, payment, profile, or credit variables are
required for the free BYOK release path.

## Persistent Analytics

Admin analytics are stored in memory unless a Redis-compatible REST store is
configured. For production, set one of these pairs:

| Variable | Purpose |
| --- | --- |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Vercel KV REST credentials |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST credentials |

For Cloudflare Pages, deploy the `functions/` directory, bind a KV namespace
named `ANALYTICS_KV`, and set `ADMIN_TOKEN` in Pages environment variables.

## Deploy

```powershell
npm install
npm run vercel:deploy
```

## Public API

| Endpoint | Purpose |
| --- | --- |
| `/api/download` | Track and redirect to the published Windows x64 installer |
| `/api/telemetry` | Receive anonymous desktop app usage events |
| `/api/admin-stats` | Return admin analytics, protected by `ADMIN_TOKEN` |

The admin dashboard is available at `/admin.html`.
