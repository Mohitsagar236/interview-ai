## Building distributable desktop app (Windows)

This repository already includes Electron + Python backend integration and helper scripts to produce a Windows installer. This document collects the minimal, tested steps to produce a self-contained installer that other people can download and run.

High-level flow
- Install Node dependencies
- Create a Python virtual environment and install backend deps
- (Optional) Build a standalone Python executable bundle (PyInstaller)
- Run `electron-builder` to produce an installer (NSIS by default on Windows)

Prerequisites
- Node.js (16+ recommended). Confirm with `node -v`.
- npm (comes with Node.js).
- Python 3.8+ (3.11 recommended) with the `py` launcher available on Windows.
- Optional: Visual Studio Build Tools (for building Python wheels / PyInstaller). Install if PyInstaller or some Python packages fail to build.
- Git (optional, for cloning repo)

Key scripts (already present)
- `npm run setup:py` — creates a local `.venv` and installs `python/requirements.txt` into it.
- `npm run build:standalone` — uses `scripts/build-python-standalone.js` to build a PyInstaller executable and then runs `electron-builder` (via `npm run build` configured in `package.json`).
- `npm run build` — runs `electron-builder` to create the installer.

Quick Windows commands (PowerShell)
```powershell
# Clone (if needed) and install JS deps
git clone <repo-url>
cd interview-ai
npm install

# Create Python venv and install backend requirements
npm run setup:py

# (Optional) Build Python standalone (PyInstaller). This step may require Visual Studio Build Tools.
# If you skip this, the app will attempt to create a venv at runtime or use the embedded Python flow.
npm run build:standalone

# Build the Electron installer (NSIS)
npm run build

# Output: check the `dist` folder for the produced installer (.exe)
```

Notes and troubleshooting
- If PyInstaller fails with build errors: ensure the `.venv` was created by `npm run setup:py` and that the Visual Studio C++ build tools are installed. Search the PyInstaller errors for the failing package name.
- If you prefer not to produce a single-file Python exe, skip `build:standalone` and let the packaged app create a venv at first-run (the Electron main process contains logic to create a venv or embedded Python for Windows).
- The `build-python-standalone.js` script writes into `python-dist/` and updates `package.json` build extraResources so the executable is bundled into the final installer.
- For production releases you should code sign the installer and the binaries. Electron-builder supports signing; see the electron-builder docs and set signing env variables.
- If users report missing dependencies at runtime, check `package.json` build.files and `build.extraResources` to ensure required Python files are included. The project already includes common entries for `python/**/*` and `python-dist/`.

What I changed here
- Added this `PACKAGING.md` with step-by-step Windows packaging commands and advice.

Next steps I can take for you
- Add an automated GitHub Actions workflow that builds the PyInstaller bundle and runs `electron-builder` to produce artifacts you can publish.
- Tweak `package.json` NSIS options (installer name, one-click vs wizard, perMachine) to match your distribution preferences and company branding.
- Run a local build here (it can take several minutes and needs Visual Studio build tools). Ask me to proceed if you want me to run a test build now.

If you want a single-click flow for end-users (download installer → install → app works immediately), I'd recommend producing a signed NSIS installer and including the PyInstaller-built `interview-ai-server.exe` in `python-dist/` (the repo already has a script for this). Happy to automate that next.
