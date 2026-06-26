# Vercel Deployment

Vercel is used only for the public website and authenticated installer download.
The desktop app runs locally on the user's machine.

## Required Environment Variables

| Variable | Purpose |
| --- | --- |
| `R2_PUBLIC_URL` | Public base URL where release installers are hosted |
| `APP_VERSION` | Installer version, for example `0.1.0` |
| `APP_BUILD_ID` | Build identifier appended to the installer URL |
| `SUPABASE_URL` | Supabase project URL used for website login |
| `SUPABASE_ANON_KEY` | Supabase anon key used by browser auth and token verification |

No Razorpay, activation, payment, profile, or credit variables are
required for the free BYOK release path.

## Supabase SQL

Run these scripts in the Supabase SQL editor for the project used by
`SUPABASE_URL`:

| Script | Purpose |
| --- | --- |
| `docs/deployment/auth-login-tracking.sql` | Stores each authenticated user's Supabase id and email, plus login events |
| `docs/deployment/careers-supabase.sql` | Stores careers applications and private resume uploads |

## Deploy

```powershell
npm install
npm run vercel:deploy
```

## Public API

| Endpoint | Purpose |
| --- | --- |
| `/api/public-config` | Expose public Supabase auth config to the website |
| `/api/download` | Require Supabase login, then return the Windows x64 installer URL |
