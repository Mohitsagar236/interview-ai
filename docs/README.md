# Interview AI Documentation

Interview AI is a local-first, proprietary free-use desktop app owned by Mohit Sagar. Users install the desktop app and bring their own API keys. There is no hosted account, payment, activation code, or credit system required for the production BYOK path.

## Start Here

| Guide | Purpose |
| --- | --- |
| [Quick Start](getting-started/quick-start.md) | Install, configure, and use the desktop app |
| [Environment Configuration](getting-started/environment-configuration.md) | BYOK settings and developer `.env` guidance |
| [Common Issues](troubleshooting/common-issues.md) | Troubleshooting local app setup |
| [System Architecture](architecture/system-architecture.md) | Electron plus bundled Python backend overview |

## Build Commands

```powershell
npm install
npm run setup:py
npm run dev
npm run build:prod
```

`npm run build:prod` builds the Python backend into `python-dist/` and packages it with Electron. Do not ship `.env` in release builds.
