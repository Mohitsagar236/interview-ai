/**
 * Verify that the repository is ready to produce a self-contained desktop build.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const checks = [];

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function check(name, condition, help) {
  checks.push({ name, ok: Boolean(condition), help });
}

function hasNonEmptyDir(relativePath) {
  const dir = path.join(rootDir, relativePath);
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length > 0;
}

console.log('Verifying Interview AI build setup...\n');

const packageJson = readJson('package.json');
const build = packageJson.build || {};
const resources = Array.isArray(build.extraResources) ? build.extraResources : [];
const files = Array.isArray(build.files) ? build.files : [];

check('package.json exists', exists('package.json'));
check('Electron entry exists', exists('electron/main.js'));
check('Preload bridge exists', exists('electron/preload.js'));
check('Toolbar UI exists', exists('renderer/toolbar.html') && exists('renderer/toolbar.js'));
check('Settings UI exists', exists('renderer/settings.html') && exists('renderer/settings.js'));
check('Python backend source exists', exists('python/server.py'));
check('Portable Python requirements exist', exists('python/requirements-portable.txt'));
check('Node dependencies are installed', hasNonEmptyDir('node_modules'), 'Run npm install.');
check('Build script creates standalone backend', /build-python-standalone\.js/.test(packageJson.scripts?.build || ''), 'Use npm run build after npm install.');
check('Build includes Electron app files', files.includes('electron/**/*') && files.includes('renderer/**/*'));
check('Build includes python-dist resource', resources.some(res => res.to === 'python-dist'), 'Run npm run build so python-dist is generated and packaged.');
check('Build includes bundled Tesseract resource', resources.some(res => res.to === 'tesseract'), 'Keep external-deps/tesseract in the repo for Windows fallback OCR.');
check('Bundled Tesseract executable exists', exists('external-deps/tesseract/tesseract.exe'));
check('Standalone backend output exists', exists('python-dist/interview-ai-server.exe') || exists('python-dist/interview-ai-server'), 'Run npm run build or npm run build:standalone.');

let passed = 0;
for (const result of checks) {
  const mark = result.ok ? 'OK' : 'FAIL';
  console.log(`${mark.padEnd(5)} ${result.name}`);
  if (!result.ok && result.help) {
    console.log(`      ${result.help}`);
  }
  if (result.ok) passed++;
}

console.log(`\n${passed}/${checks.length} checks passed.`);

if (passed !== checks.length) {
  console.log('\nBuild setup is not ready yet. Fix the failed checks above.');
  process.exit(1);
}

console.log('\nBuild setup looks ready for a self-contained desktop package.');
