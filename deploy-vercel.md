# Deploying this repo to Vercel (static `public/` site)

This repository contains a static site in the `public/` folder which can be deployed directly to Vercel. The repository also contains Python server code in the `python/` folder — that server will not run on Vercel as-is. See notes below for backend options.

Files added for Vercel:

- `vercel.json` — config to tell Vercel to serve the `public/` folder as a static site.

Quick PowerShell steps to deploy from your machine:

1. Install the Vercel CLI (if you don't already have it):

```powershell
npm install -g vercel
```

2. From the repo root, log in and deploy:

```powershell
cd C:\Users\cp813\Desktop\interview-ai
vercel login
vercel --prod
```

The `vercel` command prompts to link to an existing project or create a new one. Choose accordingly.

Backend (Python) notes:

- The code under `python/` appears to be a full server and CLI tooling (for example `server.py`, `start_server.py`). Vercel supports serverless functions (Node.js, Python via Serverless Functions) but complex stateful Python servers or long-running processes are better hosted on a dedicated host (Render, Fly, Heroku, or a VPS).
- If you need API endpoints on Vercel:
  - Convert lightweight endpoints to Vercel Serverless Functions under an `api/` folder (Node.js/TypeScript is most commonly used). For Python serverless functions you can add files to `api/` with a supported Python runtime, but test carefully (cold starts, size limits).
  - Alternatively host the Python server elsewhere and point the frontend to that API via environment variables. You can set environment variables in the Vercel project settings or use `vercel env`.

Environment variable example (link your frontend to the external API):

```powershell
# set an environment variable for production
vercel env add NEXT_PUBLIC_API_URL production
# or set via the Vercel dashboard
```

Troubleshooting:

- If assets (fonts, CSS) 404, confirm paths are relative to `public/` and included in the Git repo. Vercel serves the `public/` root at the project root.
- If you prefer a custom build step (e.g., processing assets), replace the `@vercel/static` build with a proper framework/runtime and add a `build` script in `package.json`.

If you'd like, I can:

- Add a tiny `api/` folder with an example Python serverless function (hello world) to demonstrate endpoints on Vercel.
- Add a `vercel` npm script to `package.json` to make CLI deployment easier.
