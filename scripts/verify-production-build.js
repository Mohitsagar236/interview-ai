const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
let allPassed = true;

function exists(relativePath, isDir = false) {
  const target = path.join(rootDir, relativePath);
  try {
    const stats = fs.statSync(target);
    return isDir ? stats.isDirectory() : stats.isFile();
  } catch {
    return false;
  }
}

function sizeLabel(relativePath) {
  const size = fs.statSync(path.join(rootDir, relativePath)).size;
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  if (size > 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${size} bytes`;
}

function check(name, ok, help) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
  if (!ok) {
    allPassed = false;
    if (help) console.log(`     ${help}`);
  }
}

console.log('\nProduction Build Verification\n');

const fileChecks = [
  ['Windows icon', 'assets/icon.ico'],
  ['Web/app PNG icon', 'assets/icon.png'],
  ['PyInstaller backend', 'python-dist/interview-ai-server.exe'],
  ['Tesseract executable', 'external-deps/tesseract/tesseract.exe'],
  ['Tesseract English data', 'external-deps/tesseract/tessdata/eng.traineddata'],
  ['Tesseract orientation data', 'external-deps/tesseract/tessdata/osd.traineddata'],
  ['Production builder config', 'electron-builder-prod.json'],
  ['Example environment file', '.env.example'],
  ['Electron main process', 'electron/main.js'],
  ['Electron preload bridge', 'electron/preload.js'],
  ['Toolbar UI', 'renderer/toolbar.html'],
  ['Package manifest', 'package.json']
];

for (const [name, file] of fileChecks) {
  const ok = exists(file);
  check(`${name}${ok ? ` (${sizeLabel(file)})` : ''}`, ok, `Missing ${file}`);
}

console.log('\nConfiguration');

try {
  const config = JSON.parse(fs.readFileSync(path.join(rootDir, 'electron-builder-prod.json'), 'utf8'));
  const extraResources = Array.isArray(config.extraResources) ? config.extraResources : [];
  const files = Array.isArray(config.files) ? config.files : [];
  const targets = config.win?.target || [];
  const targetList = JSON.stringify(targets);

  check('Bundles python-dist as extraResource', extraResources.some(r => r.to === 'python-dist'));
  check('Bundles Tesseract as extraResource', extraResources.some(r => r.to === 'tesseract'));
  check('Excludes raw Python source', files.includes('!python/**/*'));
  check('Excludes python-dist from app asar', files.includes('!python-dist/**/*'));
  check('Does not include .env', !files.includes('.env'));
  check('Windows x64 NSIS target configured', targetList.includes('nsis') && targetList.includes('x64'));
  check('No macOS production target configured', !config.mac);
  check('No Linux production target configured', !config.linux);
  check('Windows icon configured', config.win?.icon === 'assets/icon.ico');
} catch (error) {
  check('Production builder config is readable JSON', false, error.message);
}

console.log('');

if (!allPassed) {
  console.log('Production build verification failed.');
  process.exit(1);
}

console.log('All production build checks passed.');
console.log('Ready to build: npm run build:prod\n');
