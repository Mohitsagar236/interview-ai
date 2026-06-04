#!/usr/bin/env node
// Launcher that clears ELECTRON_RUN_AS_NODE before spawning the Electron binary.
// VSCode (and other Electron-based editors) set ELECTRON_RUN_AS_NODE=1 in their
// terminal sessions to prevent nested Electron contexts, which breaks child apps.
'use strict';

delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require('child_process');
const path = require('path');

const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const appDir = path.join(__dirname, '..');

const child = spawn(electronBin, [appDir], {
  stdio: 'inherit',
  env: process.env,
  cwd: appDir,
});

child.on('close', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('Failed to start Electron:', err.message);
  process.exit(1);
});
