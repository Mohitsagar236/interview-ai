#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const env = {
  ...process.env,
  PYTHONPATH: [
    path.join(root, '.py310-deps'),
    path.join(root, 'python'),
    root,
    process.env.PYTHONPATH || '',
  ].filter(Boolean).join(path.delimiter),
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: false,
  });
  return result.status === 0;
}

const pytestExe = path.join(root, '.py310-deps', 'bin', 'pytest.exe');
if (fs.existsSync(pytestExe)) {
  process.exit(run(pytestExe, ['python/tests', '-q']) ? 0 : 1);
}

const candidates = [
  process.env.PYTHON,
  path.join(root, '.venv', 'Scripts', 'python.exe'),
  'C:\\edb\\languagepack\\v3\\Python-3.10\\python.exe',
  'python',
  'py',
].filter(Boolean);

for (const python of candidates) {
  const version = spawnSync(python, ['--version'], { cwd: root, env, shell: false });
  if (version.status !== 0) continue;
  process.exit(run(python, ['-m', 'pytest', 'python/tests', '-q']) ? 0 : 1);
}

console.error('No runnable Python or pytest executable found for comprehensive tests.');
process.exit(1);
