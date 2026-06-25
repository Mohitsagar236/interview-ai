/**
 * Fast offline smoke tests for the free BYOK desktop app.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const checks = [];

function file(relativePath) {
  return path.join(rootDir, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(file(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(file(relativePath), 'utf8');
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function check(name, condition, help) {
  checks.push({ name, ok: Boolean(condition), help });
}

const packageJson = json('package.json');
const mainJs = read('electron/main.js');
const preloadJs = read('electron/preload.js');
const configJs = read('electron/config.js');
const toolbarHtml = read('renderer/toolbar.html');
const toolbarJs = read('renderer/toolbar.js');
const settingsJs = read('renderer/settings.js');
const serverPy = read('python/server.py');
const downloadJs = read('public/download.js');
const downloadHtml = read('public/download.html');
const siteAuthJs = read('public/site-auth.js');
const apiDownloadJs = read('api/download.js');
const apiPublicConfigJs = read('api/public-config.js');
const devServerJs = read('dev-server.js');
const functionsDownloadJs = read('functions/api/download.js');

check('Electron main entry exists', exists(packageJson.main || 'electron/main.js'));
check('Toolbar files exist', exists('renderer/toolbar.html') && exists('renderer/toolbar.js'));
check('Settings files exist', exists('renderer/settings.html') && exists('renderer/settings.js'));
check('Python backend exists', exists('python/server.py'));
check('Desktop config is local-first', /useLocalServer:\s*true/.test(configJs) && /cloudMode:\s*false/.test(configJs));
check('Activation is bypassed for free BYOK mode', /desktop-get-activation-status/.test(mainJs) && /activated:\s*true/.test(mainJs));
check('Credits are bypassed for free BYOK mode', /FREE_BYOK_CREDITS/.test(mainJs) && /remaining:\s*9999/.test(mainJs));
check('Preload exposes settings API', /settings:\s*\{/.test(preloadJs) && /saveApiKey/.test(preloadJs));
check('Toolbar connects to local backend', /localhost/.test(toolbarJs) && /init_session/.test(toolbarJs));
check('Settings saves BYO provider keys', /saveApiKey/.test(settingsJs) && /openrouter/.test(settingsJs));
check('Backend accepts BYOK session config', /init_session/.test(serverPy) && /session_configs/.test(serverPy));
check('Backend supports OCR messages', /mtype == "ocr"/.test(serverPy));
check('Backend supports coach messages', /mtype == "coach"/.test(serverPy));
check('Build script bundles standalone backend', /build-python-standalone\.js/.test(packageJson.scripts?.build || ''));
check('Smoke target points at this script', packageJson.scripts?.test === 'node ./scripts/smoke-test.js');
check('Toolbar markup has capture and Ask AI controls', /captureAnalyze/.test(toolbarHtml) && /askAI/.test(toolbarHtml));
check('Download page requires Supabase auth', /supabase-js@2/.test(downloadHtml) && /download-auth-modal/.test(downloadHtml) && /signInWithPassword/.test(downloadJs) && /signUp/.test(downloadJs));
check('Header shows login and signup links', /download\.html\?auth=signin/.test(read('public/index.html')) && /download\.html\?auth=signup/.test(read('public/index.html')) && /data-auth-open="signin"/.test(downloadHtml) && /data-auth-open="signup"/.test(downloadHtml));
check('Homepage header shows profile when signed in', /site-auth\.js/.test(read('public/index.html')) && /data-site-auth-profile/.test(read('public/index.html')) && /data-site-profile-email/.test(read('public/index.html')) && /data-site-auth-logout/.test(read('public/index.html')));
check('Homepage profile reads Supabase session', /getSession/.test(siteAuthJs) && /data-site-auth-logged-out/.test(siteAuthJs) && /signOutSiteUser/.test(siteAuthJs));
check('Download buttons use delegated click handlers', /data-download-platform="windows"/.test(downloadHtml) && /handlePageClick/.test(downloadJs) && !/onclick="downloadApp/.test(downloadHtml));
check('Auth flow shows friendly errors and success popups', /friendlyAuthError/.test(downloadJs) && /Invalid email or password/.test(downloadJs) && /Successfully logged in/.test(downloadJs) && /Signup successful/.test(downloadJs));
check('Auth password field has show/hide toggle', /data-password-toggle/.test(downloadHtml) && /togglePasswordVisibility/.test(downloadJs) && /fa-eye-slash/.test(downloadJs));
check('Auth profile shows user details and logout', /data-auth-profile/.test(downloadHtml) && /data-profile-email/.test(downloadHtml) && /data-auth-logout/.test(downloadHtml) && /performSignOut/.test(downloadJs));
check('Profile UI hides session expiry details', !/data-profile-expiry/.test(downloadHtml) && !/data-site-profile-expiry/.test(read('public/index.html')) && !/Session expires|Expires in 60 min/.test(downloadHtml + read('public/index.html')));
check('Auth session is capped at 60 minutes', /AUTH_SESSION_MAX_AGE_MS = 60 \* 60 \* 1000/.test(downloadJs) && /AUTH_SESSION_MAX_AGE_MS = 60 \* 60 \* 1000/.test(siteAuthJs) && /autoRefreshToken:\s*false/.test(downloadJs) && /autoRefreshToken:\s*false/.test(siteAuthJs) && /MAX_AUTH_SESSION_SECONDS = 60 \* 60/.test(apiDownloadJs) && /MAX_AUTH_SESSION_SECONDS = 60 \* 60/.test(functionsDownloadJs));
check('Download page warns when opened from file protocol', /window\.location\.protocol === 'file:'/.test(downloadJs) && /npm run serve/.test(downloadJs));
check('Supabase URL normalization strips REST/Auth paths', /normalizeSupabaseUrl/.test(apiDownloadJs) && /normalizeSupabaseUrl/.test(apiPublicConfigJs) && /normalizeSupabaseUrl/.test(devServerJs));
check('Download API verifies Supabase token', /auth\/v1\/user/.test(apiDownloadJs) && /Authorization/.test(apiDownloadJs) && /SUPABASE_ANON_KEY/.test(apiDownloadJs));

let passed = 0;
for (const result of checks) {
  const mark = result.ok ? 'OK' : 'FAIL';
  console.log(`${mark.padEnd(5)} ${result.name}`);
  if (!result.ok && result.help) {
    console.log(`      ${result.help}`);
  }
  if (result.ok) passed++;
}

console.log(`\n${passed}/${checks.length} smoke checks passed.`);

if (passed !== checks.length) {
  process.exit(1);
}
