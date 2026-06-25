# Vercel Deployment

Vercel is used only for the public website and the installer download redirect.
The desktop app runs locally on the user's machine.

## Required Environment Variables

| Variable | Purpose |
| --- | --- |
| `R2_PUBLIC_URL` | Public base URL where release installers are hosted |
| `APP_VERSION` | Installer version, for example `0.1.0` |

No Supabase, Razorpay, activation, payment, profile, or credit variables are
required for the free BYOK release path.

## Deploy

```powershell
npm install
npm run vercel:deploy
```

## Public API

| Endpoint | Purpose |
| --- | --- |
| `/api/download` | Redirect to the published Windows x64 installer |
