const _electronModule = require('electron');
console.log('[DEBUG] require(electron) type:', typeof _electronModule, 'hasApp:', !!(_electronModule && _electronModule.app), 'hasIpcMain:', !!(_electronModule && _electronModule.ipcMain));
const { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, screen, powerMonitor, session, shell } = _electronModule;
const path = require('path');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

// Load .env file from project root (critical for all environment variables)
const dotenv = require('dotenv');

// Try multiple locations for .env file
let envLoaded = false;
const envLocations = [
  path.join(__dirname, '..', '.env'),                    // Development: project root
  path.join(process.resourcesPath, 'app.asar.unpacked', '.env'), // Packaged: asar unpacked
  path.join(process.resourcesPath, '.env'),              // Packaged: resources folder (if not in asar)
  (() => { try { return path.join(app.getPath('userData'), '.env'); } catch(e) { return ''; } })(), // User data folder (user override)
  path.join(process.cwd(), '.env')                       // Current working directory
];

console.log('[ENV] Searching for .env file...');
for (const envPath of envLocations) {
  console.log(`[ENV] Checking: ${envPath}`);
  if (fs.existsSync(envPath)) {
    const envResult = dotenv.config({ path: envPath });
    if (!envResult.error) {
      console.log(`[ENV] ✅ Loaded environment variables from ${envPath}`);
      envLoaded = true;
      break;
    } else {
      console.warn(`[ENV] ⚠️ Found .env but failed to load: ${envResult.error.message}`);
    }
  }
}

if (!envLoaded) {
  console.warn(`[ENV] ⚠️ No .env file found in any location. Will rely on system env vars and settings.json`);
  console.warn(`[ENV] This is OK if you configure API keys via Settings UI.`);
}

// Configure bundled Tesseract OCR path — deferred until app is ready
if (app && typeof app.whenReady === 'function') app.whenReady().then(() => {
  if (!app.isPackaged) return;
  const tesseractExe = path.join(process.resourcesPath, 'tesseract', 'tesseract.exe');
  const tessdataPath = path.join(process.resourcesPath, 'tesseract', 'tessdata');
  if (fs.existsSync(tesseractExe)) {
    process.env.TESSERACT_CMD = tesseractExe;
    process.env.TESSDATA_PREFIX = tessdataPath;
    console.log('[OCR] ✅ Using bundled Tesseract OCR');
  } else {
    console.warn('[OCR] ⚠️ Bundled Tesseract not found, will try system installation');
  }
});

console.log('[ENV] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('[ENV] Environment Variables Status:');
const criticalVars = ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'DEFAULT_LLM', 'DEEPGRAM_API_KEY', 'USE_STREAMING_TRANSCRIPTION', 'STREAMING_PROVIDER'];
criticalVars.forEach(v => {
  if (process.env[v]) {
    // Mask API keys for security
    if (v.includes('API_KEY') || v.includes('_KEY')) {
      const val = process.env[v];
      if (val && val.length > 12) {
        const masked = val.substring(0, 8) + '...' + val.substring(val.length - 4);
        console.log(`[ENV] ✅ ${v} = ${masked}`);
      } else {
        console.log(`[ENV] ✅ ${v} is set`);
      }
    } else {
      console.log(`[ENV] ✅ ${v} = ${process.env[v]}`);
    }
  } else {
    console.log(`[ENV] ❌ ${v} is NOT set`);
  }
});
console.log('[ENV] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

let toolbarWindow;
let setupWindow = null;
let overlayWindows = [];
let overlayDebug = false;
let forcedStealth = !process.env.DISABLE_STEALTH_OVERLAY; // Can be disabled via environment variable
let toolbarBounds = null; // persist toolbar bounds between sessions
let serverProcess = null;
let serverPort = 8765; // default / discovered
// Data persistence paths (lazy-init after app ready)
let dataDir = null;
let profilePath = null;
let connectionsPath = null;
let resumesMetaPath = null;
let settingsPath = null;
let interviewsPath = null;
let activitiesPath = null; // activity feed persistence
let heartbeatInterval = null;
let buildingMainApp = false; // guard concurrent builds
// In-memory parsed resume store (id -> {text, chunks, meta}) for quick search (will persist later)
let parsedResumes = new Map();
// Semantic search index (TF-IDF lightweight)
let semanticIndex = { docs: [], df: new Map(), totalDocs: 0 }; // docs: [{rid, chunk, text, tf:Map, norm}]
// Interview coach websocket client (lazy)
let coachWS = null;
let coachWSConnecting = false;
// File I/O cache to reduce disk operations
let fileCache = new Map(); // path -> { data, timestamp }
const CACHE_TTL = 5000; // 5 seconds cache
const CACHE_MAX_SIZE = 20;
// CHANGED: Load settings store (encrypted local persistence for BYOK mode)
const { store: settingsStore, saveApiKey, getApiKey, clearAllKeys, hasAnyAiKey, hasDeepgramKey, hasClaudeAccount } = require('./settings-store');

// ---------------- Backend bootstrap helpers ----------------
function getPythonScriptsRoot() {
  // Prefer external resources path in packaged app; fallback to source tree in dev
  try {
    const packaged = app.isPackaged;
    if (packaged) {
      const p = path.join(process.resourcesPath, 'python');
      if (fs.existsSync(p)) return p;
    }
  } catch {}
  const devPath = path.join(__dirname, '..', 'python');
  return devPath;
}

function getBundledSitePackages() {
  // Get bundled site-packages path for packaged app
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, 'python', 'site-packages');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getStandalonePythonExecutable() {
  // Check if we have a standalone PyInstaller-built executable
  if (app.isPackaged) {
    const exeName = process.platform === 'win32' ? 'interview-ai-server.exe' : 'interview-ai-server';
    const p = path.join(process.resourcesPath, 'python-dist', exeName);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getRequirementsPath() {
  const root = getPythonScriptsRoot();
  const p = path.join(root, 'requirements.txt');
  return p;
}

function getUserVenvDir() {
  // Create a venv in userData so it survives updates
  const base = app.getPath('userData');
  return path.join(base, 'backend-venv');
}

function getVenvPythonExe(venvDir) {
  return process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
}

function findSystemPythonCandidate() {
  // Prefer Windows launcher 'py -3' if available; else 'python', else 'python3'
  const candidates = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python'];
  return candidates;
}

function trySpawnCheck(cmd, args) {
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd, args, { stdio: 'ignore', shell: false });
      p.on('error', () => resolve(false));
      p.on('exit', (code) => resolve(code === 0));
    } catch { resolve(false); }
  });
}

async function resolveSystemPython() {
  const candidates = findSystemPythonCandidate();
  for (const c of candidates) {
    if (c === 'py') {
      const ok = await trySpawnCheck('py', ['-3', '-V']);
      if (ok) return { cmd: 'py', args: ['-3'] };
    } else {
      const ok = await trySpawnCheck(c, ['-V']);
      if (ok) return { cmd: c, args: [] };
    }
  }
  return null;
}

async function ensureVenvReady(logPrefix='[Backend]') {
  const venvDir = getUserVenvDir();
  const venvPy = getVenvPythonExe(venvDir);
  if (fs.existsSync(venvPy)) return { venvDir, venvPy };

  // First-time setup — show progress window
  createSetupWindow();
  sendSetupProgress(2, 'Finding Python installation…', 'Looking for Python 3…', 'inf');

  const sysPy = await resolveSystemPython();
  if (!sysPy) {
    const msg = 'Python 3 not found. Please install Python 3.10+ from python.org and relaunch.';
    sendSetupProgress(0, 'Python not found', msg, 'err');
    console.error(`${logPrefix} ${msg}`);
    return { error: 'python-missing' };
  }

  sendSetupProgress(8, 'Creating virtual environment…', `Found Python: ${sysPy.cmd}`, 'ok');
  console.log(`${logPrefix} Creating virtual environment at ${venvDir}`);
  await new Promise((resolve, reject) => {
    const args = [...sysPy.args, '-m', 'venv', venvDir];
    const p = spawn(sysPy.cmd, args, { shell: false });
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error('venv exit code '+code)));
    p.on('error', reject);
  });

  sendSetupProgress(15, 'Upgrading pip…', 'Virtual environment created', 'ok');

  await new Promise((resolve) => {
    const p = spawn(venvPy, ['-m', 'pip', 'install', '--upgrade', 'pip', 'wheel', 'setuptools'], { shell: false });
    const fwd = (d) => { const s = d.toString().trim(); if (s) { console.log(`${logPrefix} ${s}`); sendSetupProgress(null, null, s); } };
    p.stdout.on('data', fwd);
    p.stderr.on('data', fwd);
    p.on('exit', () => resolve());
    p.on('error', () => resolve());
  });

  // Prefer portable (lightweight) requirements for the initial install
  const scriptRoot = getPythonScriptsRoot();
  const portableReq = path.join(scriptRoot, 'requirements-portable.txt');
  const fullReq = getRequirementsPath();
  const req = fs.existsSync(portableReq) ? portableReq : fullReq;
  const reqLabel = fs.existsSync(portableReq) ? 'requirements-portable.txt' : 'requirements.txt';

  try { fs.accessSync(req, fs.constants.R_OK); } catch {
    console.warn(`${logPrefix} requirements file not found: ${req}`);
    return { venvDir, venvPy };
  }

  sendSetupProgress(20, `Installing AI backend packages (${reqLabel})…`,
    `Installing from ${reqLabel} — this takes 2-5 min…`, 'inf');
  console.log(`${logPrefix} Installing backend requirements from ${req}`);

  let installPct = 20;
  await new Promise((resolve, reject) => {
    const p = spawn(venvPy, ['-m', 'pip', 'install', '-r', req, '--progress-bar', 'off'], { shell: false });
    const fwd = (d) => {
      const lines = d.toString().split(/\r?\n/).filter(Boolean);
      lines.forEach(l => {
        console.log(`${logPrefix} ${l}`);
        // Bump progress as packages install
        if (/Successfully installed/i.test(l)) { installPct = Math.min(installPct + 4, 88); }
        else if (/Collecting|Downloading|Installing/i.test(l)) { installPct = Math.min(installPct + 1, 87); }
        sendSetupProgress(installPct, `Installing packages…`, l);
      });
    };
    p.stdout.on('data', fwd);
    p.stderr.on('data', fwd);
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error('pip exit code '+code)));
    p.on('error', reject);
  });

  sendSetupProgress(95, 'Finalizing setup…', 'All packages installed successfully', 'ok');
  return { venvDir, venvPy };
}

function resolveServerPyPath() {
  const root = getPythonScriptsRoot();
  const p = path.join(root, 'server.py');
  return fs.existsSync(p) ? p : null;
}

async function ensureCoachWS() {
  if (coachWS && coachWS.readyState === 1) return coachWS;
  if (coachWSConnecting) {
    // Wait until existing attempt finishes (max 3s)
    return await new Promise(resolve => {
      let waited = 0; const iv = setInterval(() => {
        if (coachWS && coachWS.readyState === 1) { clearInterval(iv); resolve(coachWS); }
        waited += 100; if (waited >= 3000) { clearInterval(iv); resolve(coachWS); }
      },100);
    });
  }
  coachWSConnecting = true;
  return await new Promise(resolve => {
    try {
      const url = `ws://127.0.0.1:${serverPort}`;
      const ws = new WebSocket(url);
      coachWS = ws;
      ws.on('open', () => { coachWSConnecting = false; resolve(ws); });
      ws.on('error', (e) => { console.error('Coach WS error', e.message); coachWSConnecting = false; resolve(null); });
      ws.on('close', () => { coachWSConnecting = false; coachWS = null; });
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg && msg.type === 'coach') {
            sendToUi('coach-update', {
              text: msg.text || '',
              reset: !!msg.reset,
              replace: !!msg.replace,
              complete: !!msg.complete,
              error: msg.error || null
            });
          }
        } catch (err) { /* ignore parse errors */ }
      });
    } catch (e) {
      console.error('Failed to create coach WS', e.message);
      coachWSConnecting = false; resolve(null);
    }
  });
}

// ---------------- Embedded Python (Windows) ----------------
function getEmbeddedPythonDir() {
  const base = app.getPath('userData');
  const ver = '3.11.9';
  return path.join(base, `python-embed-${ver}`);
}

function getEmbeddedPythonExe() {
  return path.join(getEmbeddedPythonDir(), 'python.exe');
}

function downloadToFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // redirect
        file.close(); fs.unlink(dest, () => {});
        return resolve(downloadToFile(res.headers.location, dest));
      }
      if (res.statusCode !== 200) {
        file.close(); fs.unlink(dest, () => {});
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    }).on('error', (err) => { file.close(); fs.unlink(dest, () => {}); reject(err); });
  });
}

function expandZipPowershell(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const ps = process.env.ComSpec && process.env.ComSpec.toLowerCase().includes('powershell')
      ? 'powershell'
      : 'powershell';
    const args = ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`];
    const p = spawn(ps, args, { shell: false });
    let err = '';
    p.stderr.on('data', d => { err += d.toString(); });
    p.on('exit', (code) => {
      if (code === 0) resolve(); else reject(new Error(`Expand-Archive exit ${code}: ${err}`));
    });
    p.on('error', reject);
  });
}

async function ensureEmbeddedPythonWindows(logPrefix='[Embed]') {
  const embedDir = getEmbeddedPythonDir();
  const pyExe = getEmbeddedPythonExe();
  if (!fs.existsSync(embedDir)) fs.mkdirSync(embedDir, { recursive: true });
  if (!fs.existsSync(pyExe)) {
    // Download embeddable zip
    const ver = '3.11.9';
    const file = `python-${ver}-embed-amd64.zip`;
    const url = `https://www.python.org/ftp/python/${ver}/${file}`;
    const tmpZip = path.join(embedDir, file);
    console.log(`${logPrefix} Downloading ${url}`);
    await downloadToFile(url, tmpZip);
    console.log(`${logPrefix} Extracting to ${embedDir}`);
    await expandZipPowershell(tmpZip, embedDir);
    try { fs.unlinkSync(tmpZip); } catch {}
    // Enable site in _pth file
    try {
      const pth = fs.readdirSync(embedDir).find(n => /python\d+\d+\.\_pth$/i.test(n));
      if (pth) {
        const pthPath = path.join(embedDir, pth);
        let txt = fs.readFileSync(pthPath, 'utf8');
        if (!/^import site/m.test(txt)) {
          txt = txt.replace(/#\s*import\s+site/m, 'import site');
          fs.writeFileSync(pthPath, txt, 'utf8');
          console.log(`${logPrefix} Enabled 'import site' in ${pth}`);
        }
      }
    } catch (e) {
      console.warn(`${logPrefix} Failed to enable site:`, e.message);
    }
  }
  // Ensure pip exists
  const hasPip = await new Promise((resolve) => {
    try {
      const p = spawn(pyExe, ['-m', 'pip', '--version']);
      p.on('exit', (code) => resolve(code === 0));
      p.on('error', () => resolve(false));
    } catch { resolve(false); }
  });
  if (!hasPip) {
    const getPip = 'https://bootstrap.pypa.io/get-pip.py';
    const dest = path.join(embedDir, 'get-pip.py');
    console.log(`${logPrefix} Bootstrapping pip...`);
    await downloadToFile(getPip, dest);
    await new Promise((resolve, reject) => {
      const p = spawn(pyExe, [dest]);
      p.stdout.on('data', d => console.log(`${logPrefix} ${d.toString().trim()}`));
      p.stderr.on('data', d => console.log(`${logPrefix} ${d.toString().trim()}`));
      p.on('exit', (code) => code === 0 ? resolve() : reject(new Error('get-pip exit '+code)));
      p.on('error', reject);
    });
    try { fs.unlinkSync(dest); } catch {}
  }
  return { pyExe };
}

async function ensureRequirementsInstalledPython(pyExe, requirementsPath, logPrefix='[Deps]') {
  try { fs.accessSync(requirementsPath, fs.constants.R_OK); } catch { console.warn(`${logPrefix} No requirements found at ${requirementsPath}`); return; }
  await new Promise((resolve, reject) => {
    const p = spawn(pyExe, ['-m', 'pip', 'install', '--upgrade', 'pip', 'wheel', 'setuptools']);
    p.stdout.on('data', d => console.log(`${logPrefix} ${d.toString().trim()}`));
    p.stderr.on('data', d => console.log(`${logPrefix} ${d.toString().trim()}`));
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error('pip upgrade exit '+code)));
    p.on('error', reject);
  });
  await new Promise((resolve, reject) => {
    const p = spawn(pyExe, ['-m', 'pip', 'install', '-r', requirementsPath]);
    p.stdout.on('data', d => console.log(`${logPrefix} ${d.toString().trim()}`));
    p.stderr.on('data', d => console.log(`${logPrefix} ${d.toString().trim()}`));
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error('pip install exit '+code)));
    p.on('error', reject);
  });
}

function tokenize(text) {
  return (text||'')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g,' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && w.length <= 40);
}

function addSemanticDocs(resumeId, chunks) {
  // Remove previous docs for this resume
  const remaining = [];
  for (const d of semanticIndex.docs) {
    if (d.rid !== resumeId) remaining.push(d); else {
      // decrement df counts
      for (const term of d.tf.keys()) {
        const cur = semanticIndex.df.get(term) || 0;
        if (cur > 1) semanticIndex.df.set(term, cur - 1); else semanticIndex.df.delete(term);
      }
      semanticIndex.totalDocs -= 1;
    }
  }
  semanticIndex.docs = remaining;
  // Add new chunks
  chunks.forEach((text, idx) => {
    const tokens = tokenize(text);
    if (!tokens.length) return;
    const tfMap = new Map();
    tokens.forEach(t => tfMap.set(t, (tfMap.get(t)||0)+1));
    // Update df once per term
    for (const term of new Set(tokens)) {
      semanticIndex.df.set(term, (semanticIndex.df.get(term)||0)+1);
    }
    // compute preliminary norm using log-weighted tf; idf applied later
    let sumSq = 0;
    for (const [term, freq] of tfMap.entries()) {
      const w = 1 + Math.log(freq);
      sumSq += w * w;
    }
    const normBase = Math.sqrt(sumSq) || 1;
    semanticIndex.docs.push({ rid: resumeId, chunk: idx, text, tf: tfMap, normBase });
    semanticIndex.totalDocs += 1;
  });
}

function ensureDataPaths() {
  if (!dataDir) {
    dataDir = path.join(app.getPath('userData'), 'profile_data');
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
    profilePath = path.join(dataDir, 'profile.json');
  connectionsPath = path.join(dataDir, 'connections.json');
  resumesMetaPath = path.join(dataDir, 'resumes.json');
  settingsPath = path.join(dataDir, 'settings.json');
  interviewsPath = path.join(dataDir, 'interviews.json');
  activitiesPath = path.join(dataDir, 'activities.json');
    
    // Initialize files if missing
    if (!fs.existsSync(profilePath)) {
      fs.writeFileSync(profilePath, JSON.stringify({ fullName: '', email: '', phone: '', location: '', bio: '' }, null, 2));
    }
    if (!fs.existsSync(connectionsPath)) {
      fs.writeFileSync(connectionsPath, JSON.stringify({ linkedin: false, github: false }, null, 2));
    }
    if (!fs.existsSync(resumesMetaPath)) {
      fs.writeFileSync(resumesMetaPath, JSON.stringify({ resumes: [] }, null, 2));
    }
    if (!fs.existsSync(settingsPath)) {
      fs.writeFileSync(settingsPath, JSON.stringify({ stealthEnabled: true, defaultLLM: 'gpt-4o-mini', autoLaunchServer: true, theme: 'dark', updatedAt: new Date().toISOString() }, null, 2));
    }
    if (!fs.existsSync(interviewsPath)) {
      fs.writeFileSync(interviewsPath, JSON.stringify({ interviews: [] }, null, 2));
    }
    if (!fs.existsSync(activitiesPath)) {
      fs.writeFileSync(activitiesPath, JSON.stringify({ activities: [] }, null, 2));
    }
  }
}

function readJSON(p, fallback) {
  try {
    // Check cache first
    const cached = fileCache.get(p);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return cached.data;
    }
    
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    
    // Update cache
    if (fileCache.size >= CACHE_MAX_SIZE) {
      // Remove oldest entry
      const oldestKey = Array.from(fileCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      fileCache.delete(oldestKey);
    }
    fileCache.set(p, { data, timestamp: Date.now() });
    
    return data;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(p, obj) {
  try { 
    fs.writeFileSync(p, JSON.stringify(obj, null, 2)); 
    // Update cache
    fileCache.set(p, { data: obj, timestamp: Date.now() });
  } catch (e) { 
    console.error('Failed write', p, e.message); 
  }
}

// ------------- Activity Feed Helpers -------------
function readActivities() { ensureDataPaths(); return readJSON(activitiesPath, { activities: [] }); }
function writeActivities(data) { writeJSON(activitiesPath, data); }
function logActivity(type, details) {
  try {
    ensureDataPaths();
    const data = readActivities();
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
      ts: new Date().toISOString(),
      type,
      details: details || {},
      summary: buildActivitySummary(type, details)
    };
    data.activities.push(entry);
    // Cap to last 400 entries
    if (data.activities.length > 400) data.activities = data.activities.slice(-400);
    writeActivities(data);
    sendToUi('activity-updated', entry);
    return entry;
  } catch (e) { console.error('logActivity failed', e.message); }
}
function buildActivitySummary(type, d){
  try {
    switch(type){
      case 'resume.upload': return `Uploaded resume ${d && d.name ? d.name : ''}`.trim();
      case 'resume.parse': return `Parsed resume ${d && d.id ? d.id : ''}`.trim();
      case 'resume.delete': return `Deleted resume ${d && d.id ? d.id : ''}`.trim();
      case 'interview.create': return `Scheduled interview ${d.role||''} @ ${d.company||''}`.trim();
      case 'interview.update': return `Updated interview ${d.id||''}`.trim();
      case 'interview.complete': return `Completed interview ${d.id||''}`.trim();
      case 'interview.session.start': return `Started session ${d.id||''}`.trim();
      case 'interview.session.end': return `Ended session ${d.id||''}`.trim();
      case 'interview.note': return `Added note to interview ${d.id||''}`.trim();
      case 'settings.save': return 'Settings updated';
      case 'interview.coach.suggest': return `AI suggestion requested for interview ${d && d.id || ''}`.trim();
      default: return type;
    }
  } catch { return type; }
}

console.log(`🔧 Stealth overlay mode: ${forcedStealth ? 'ENABLED' : 'DISABLED'} (DISABLE_STEALTH_OVERLAY=${process.env.DISABLE_STEALTH_OVERLAY})`);

// Load configuration
const config = require('./config');
console.log(`[CONFIG] Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`[CONFIG] Cloud Mode: ${config.cloudMode}`);
console.log(`[CONFIG] Server URL: ${config.serverUrl}`);

// ── Setup progress window ─────────────────────────────────────────────────────

function createSetupWindow() {
  if (setupWindow && !setupWindow.isDestroyed()) { setupWindow.focus(); return setupWindow; }
  setupWindow = new BrowserWindow({
    width: 540,
    height: 520,
    resizable: false,
    center: true,
    title: 'Interview AI — Setting Up',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  setupWindow.loadFile(path.join(__dirname, '../renderer/setup.html'));
  setupWindow.on('closed', () => { setupWindow = null; });
  return setupWindow;
}

function sendSetupProgress(pct, label, log, logType) {
  const payload = { pct, label, log, logType };
  [setupWindow].forEach(w => {
    try { if (w && !w.isDestroyed()) w.webContents.send('setup-progress', payload); } catch {}
  });
}

function closeSetupWindow() {
  try { if (setupWindow && !setupWindow.isDestroyed()) { setupWindow.close(); setupWindow = null; } } catch {}
}

function isOnboardingComplete() {
  try { return !!settingsStore.get('onboardingComplete', false); } catch { return false; }
}

function ensureToolbarWindow(options = {}) {
  const { focus = false, show = true } = options || {};
  if (!toolbarWindow || toolbarWindow.isDestroyed()) {
    createToolbarWindow();
  } else if (show) {
    toolbarWindow.show();
  }
  if (focus && toolbarWindow && !toolbarWindow.isDestroyed()) {
    toolbarWindow.focus();
  }
  return toolbarWindow;
}

function showToolbarWhenReady() {
  closeSetupWindow();
  if (isOnboardingComplete()) {
    ensureToolbarWindow({ show: true });
  }
}

function showPrimaryUi(section) {
  const normalized = String(section || '').toLowerCase();
  if (normalized === 'settings' || normalized === 'api-keys' || normalized === 'apikeys') {
    createSettingsWindow();
    return true;
  }
  ensureToolbarWindow({ focus: true, show: true });
  return true;
}

function sendToUi(channel, ...args) {
  [toolbarWindow].forEach(w => {
    try {
      if (w && !w.isDestroyed()) {
        w.webContents.send(channel, ...args);
      }
    } catch {}
  });
}

function getDialogParentWindow() {
  if (toolbarWindow && !toolbarWindow.isDestroyed()) return toolbarWindow;
  return null;
}

function showSaveDialogForApp(dialog, options) {
  const parent = getDialogParentWindow();
  return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options);
}

ipcMain.handle('setup:retry', () => { startPythonServer(); return true; });

// ─────────────────────────────────────────────────────────────────────────────

function startPythonServer() {
  // Skip local server if cloud mode is enabled
  if (config.cloudMode) {
    console.log('[Server] Cloud mode enabled - skipping local Python server');
    console.log(`[Server] Will connect to: ${config.serverUrl}`);
    return;
  }
  
  if (process.env.NO_AUTO_SERVER) {
    console.log('[Server] Auto-start disabled via NO_AUTO_SERVER');
    return;
  }
  if (serverProcess) {
    console.log('[Server] Already running');
    return;
  }
  (async () => {
    // Check for standalone PyInstaller executable first (bundled portable build)
    const standaloneExe = getStandalonePythonExecutable();
    if (standaloneExe) {
      console.log(`[Server] Using standalone executable: ${standaloneExe}`);
      
      // Start with all environment variables (includes .env loaded by dotenv)
      const env = { ...process.env };
      
      // Set default environment variables
      if (!env.DEFAULT_LLM) env.DEFAULT_LLM = 'gpt-4o-mini';
      if (!env.USE_STREAMING_TRANSCRIPTION) env.USE_STREAMING_TRANSCRIPTION = 'true';
      if (!env.OPENAI_BASE_URL) env.OPENAI_BASE_URL = 'https://openrouter.ai/api/v1';
      if (!env.STREAMING_PROVIDER) env.STREAMING_PROVIDER = 'deepgram';
      if (!env.AUTO_COACH_ENABLED) env.AUTO_COACH_ENABLED = 'true';
      if (!env.AI_TEMPERATURE) env.AI_TEMPERATURE = '0.7';
      if (!env.USE_PADDLEOCR) env.USE_PADDLEOCR = '1';  // Enable PaddleOCR for superior OCR accuracy
      
      // Override with settings from UI if available (takes precedence)
      try {
        ensureDataPaths();
        const settings = readJSON(settingsPath, {});
        
        console.log('[Server] Loading settings from settings.json...');
        
        if (settings.apiKey) {
          env.OPENAI_API_KEY = settings.apiKey;
          env.OPENROUTER_API_KEY = settings.apiKey;
          env.ANTHROPIC_API_KEY = settings.apiKey;
          env.GROQ_API_KEY = settings.apiKey;
          env.XAI_API_KEY = settings.apiKey;
          console.log('[Server] ✅ Generic API key loaded from settings');
        }
        if (settings.openaiApiKey) {
          env.OPENAI_API_KEY = settings.openaiApiKey;
          console.log('[Server] ✅ OpenAI API key loaded from settings');
        }
        if (settings.openrouterApiKey) {
          env.OPENROUTER_API_KEY = settings.openrouterApiKey;
          console.log('[Server] ✅ OpenRouter API key loaded from settings');
        }
        if (settings.anthropicApiKey) {
          env.ANTHROPIC_API_KEY = settings.anthropicApiKey;
          console.log('[Server] ✅ Anthropic API key loaded from settings');
        }
        if (settings.groqApiKey) {
          env.GROQ_API_KEY = settings.groqApiKey;
          console.log('[Server] ✅ Groq API key loaded from settings');
        }
        if (settings.xaiApiKey) {
          env.XAI_API_KEY = settings.xaiApiKey;
          console.log('[Server] ✅ X.AI API key loaded from settings');
        }
        if (settings.deepgramApiKey) {
          env.DEEPGRAM_API_KEY = settings.deepgramApiKey;
          console.log('[Server] ✅ Deepgram API key loaded from settings');
        }
        
        if (settings.defaultLLM) env.DEFAULT_LLM = settings.defaultLLM;

        // BYOK: encrypted store keys take priority over settings.json (same as venv path)
        const _ekOpenAI     = getApiKey('openai');
        const _ekOpenRouter = getApiKey('openrouter');
        const _ekAnthropic  = getApiKey('anthropic');
        const _ekGroq       = getApiKey('groq');
        const _ekDeepgram   = getApiKey('deepgram');
        const _ekGemini     = getApiKey('gemini');
        const _ekXAI        = getApiKey('xai');
        if (_ekOpenAI)     { env.OPENAI_API_KEY     = _ekOpenAI;     console.log('[Server] ✅ OpenAI key loaded from encrypted store'); }
        if (_ekOpenRouter) { env.OPENROUTER_API_KEY = _ekOpenRouter; console.log('[Server] ✅ OpenRouter key loaded from encrypted store'); }
        if (_ekAnthropic)  { env.ANTHROPIC_API_KEY  = _ekAnthropic;  console.log('[Server] ✅ Anthropic key loaded from encrypted store'); }
        if (_ekGroq)       { env.GROQ_API_KEY       = _ekGroq;       console.log('[Server] ✅ Groq key loaded from encrypted store'); }
        if (_ekDeepgram)   { env.DEEPGRAM_API_KEY   = _ekDeepgram;   console.log('[Server] ✅ Deepgram key loaded from encrypted store'); }
        if (_ekGemini)     { env.GEMINI_API_KEY     = _ekGemini;     console.log('[Server] ✅ Gemini key loaded from encrypted store'); }
        if (_ekXAI)        { env.XAI_API_KEY        = _ekXAI;        console.log('[Server] ✅ xAI key loaded from encrypted store'); }

        // AI provider / model from electron-store
        const _storedAi = settingsStore.get('ai') || {};
        if (_storedAi.model && _storedAi.model.trim()) {
          env.DEFAULT_LLM = _storedAi.model;
          console.log(`[Server] ✅ DEFAULT_LLM = ${_storedAi.model} (from store)`);
        }
        const _providerBaseUrls = {
          openrouter: 'https://openrouter.ai/api/v1',
          groq:       'https://api.groq.com/openai/v1',
          anthropic:  'https://api.anthropic.com/v1',
          gemini:     'https://generativelanguage.googleapis.com/v1beta/openai',
          openai:     'https://api.openai.com/v1',
        };
        if (_providerBaseUrls[_storedAi.provider]) {
          env.OPENAI_BASE_URL = _providerBaseUrls[_storedAi.provider];
        } else if (_storedAi.provider === 'ollama') {
          env.OLLAMA_BASE_URL = _storedAi.baseUrl || 'http://localhost:11434';
          if (!env.DEFAULT_LLM) env.DEFAULT_LLM = _storedAi.model || 'llama3';
        } else if (_storedAi.provider === 'custom' && _storedAi.baseUrl) {
          env.OPENAI_BASE_URL = _storedAi.baseUrl;
        }

        // Log final status
        console.log('[Server] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('[Server] Environment Variables Status:');
        const keys = [
          'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'DEEPGRAM_API_KEY',
          'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'XAI_API_KEY',
          'OPENAI_BASE_URL', 'DEFAULT_LLM', 'USE_STREAMING_TRANSCRIPTION',
          'STREAMING_PROVIDER'
        ];
        keys.forEach(k => {
          if (env[k]) {
            if (k.includes('API_KEY') || k.includes('_KEY')) {
              const val = env[k];
              const masked = val.substring(0, 8) + '...' + val.substring(val.length - 4);
              console.log(`[Server] ✅ ${k} = ${masked}`);
            } else {
              console.log(`[Server] ✅ ${k} = ${env[k]}`);
            }
          } else {
            console.log(`[Server] ❌ ${k} is NOT set`);
          }
        });
        console.log('[Server] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const hasAIKey = env.OPENROUTER_API_KEY || env.OPENAI_API_KEY ||
                         env.ANTHROPIC_API_KEY || env.GROQ_API_KEY || env.XAI_API_KEY;
        if (!hasAIKey) {
          console.warn('[Server] ⚠️ WARNING: No AI API keys configured! Add keys in Settings.');
        }
      } catch (e) {
        console.error('[Server] ❌ Could not load settings:', e.message);
      }

      serverProcess = spawn(standaloneExe, [], { env });
      attachServerIO();
      return;
    }
    
    // Otherwise use Python interpreter approach
    const serverPath = resolveServerPyPath();
    if (!serverPath) {
      console.error('[Server] server.py not found');
      return;
    }
    let py = null;

    // Check if venv already exists (returning user → show window right away)
    const venvAlreadyExists = fs.existsSync(getVenvPythonExe(getUserVenvDir()));
    if (venvAlreadyExists && isOnboardingComplete()) {
      ensureToolbarWindow({ show: true });
    }

    console.log('[Server] Checking for venv Python...');
    const prep = await ensureVenvReady('[Server.Setup]');
    if (prep && prep.error === 'python-missing') {
      const { dialog, shell } = require('electron');
      await dialog.showMessageBox({
        type: 'error',
        title: 'Python Required',
        message: 'Python 3 is required to run the backend and was not found on this system.',
        detail: 'Click "Get Python" to open the official download page, then reinstall and relaunch the app.',
        buttons: ['Get Python', 'OK'],
        cancelId: 1,
        defaultId: 0
      }).then(res => { if (res.response === 0) shell.openExternal('https://www.python.org/downloads/'); });
      return;
    }
    if (!prep || !prep.venvPy) {
      sendSetupProgress(0, 'Setup failed', 'Failed to prepare backend environment', 'err');
      console.error('[Server] Failed to prepare backend environment');
      return;
    }
    py = prep.venvPy;
    console.log(`[Server] Using venv Python: ${py}`);
    
    // Start with all environment variables (includes .env loaded by dotenv at startup)
    const env = { ...process.env };
    
    // CRITICAL: Add python source directory to PYTHONPATH so modules can be found
    const pythonSourceDir = getPythonScriptsRoot();
    env.PYTHONPATH = pythonSourceDir + (env.PYTHONPATH ? path.delimiter + env.PYTHONPATH : '');
    console.log(`[Server] Added Python source directory to PYTHONPATH: ${pythonSourceDir}`);
    
    // Set PYTHONPATH to include bundled packages if in production
    const bundledPackages = getBundledSitePackages();
    if (bundledPackages) {
      console.log(`[Server] Using bundled packages from: ${bundledPackages}`);
      env.PYTHONPATH = bundledPackages + path.delimiter + env.PYTHONPATH;
    }
    
    // Set default environment variables for Python server
    if (!env.DEFAULT_LLM) env.DEFAULT_LLM = 'gpt-4o-mini';
    if (!env.USE_STREAMING_TRANSCRIPTION) env.USE_STREAMING_TRANSCRIPTION = 'true';
    if (!env.OPENAI_BASE_URL) env.OPENAI_BASE_URL = 'https://openrouter.ai/api/v1';
    if (!env.STREAMING_PROVIDER) env.STREAMING_PROVIDER = 'deepgram';
    if (!env.AUTO_COACH_ENABLED) env.AUTO_COACH_ENABLED = 'true';
    if (!env.AI_TEMPERATURE) env.AI_TEMPERATURE = '0.7';
    if (!env.USE_PADDLEOCR) env.USE_PADDLEOCR = '1';  // Enable PaddleOCR for superior OCR accuracy
    
    // Override with settings from UI if available (takes precedence over .env)
    try {
      ensureDataPaths();
      const settings = readJSON(settingsPath, {});
      
      console.log('[Server] Loading settings from settings.json...');
      
      if (settings.apiKey) {
        // Map generic apiKey to specific provider keys
        env.OPENAI_API_KEY = settings.apiKey;
        env.OPENROUTER_API_KEY = settings.apiKey;
        env.ANTHROPIC_API_KEY = settings.apiKey;
        env.GROQ_API_KEY = settings.apiKey;
        env.XAI_API_KEY = settings.apiKey;
        console.log('[Server] ✅ Generic API key loaded from settings');
      }
      // Also check for provider-specific keys
      if (settings.openaiApiKey) {
        env.OPENAI_API_KEY = settings.openaiApiKey;
        console.log('[Server] ✅ OpenAI API key loaded from settings');
      }
      if (settings.openrouterApiKey) {
        env.OPENROUTER_API_KEY = settings.openrouterApiKey;
        console.log('[Server] ✅ OpenRouter API key loaded from settings');
      }
      if (settings.anthropicApiKey) {
        env.ANTHROPIC_API_KEY = settings.anthropicApiKey;
        console.log('[Server] ✅ Anthropic API key loaded from settings');
      }
      if (settings.groqApiKey) {
        env.GROQ_API_KEY = settings.groqApiKey;
        console.log('[Server] ✅ Groq API key loaded from settings');
      }
      if (settings.xaiApiKey) {
        env.XAI_API_KEY = settings.xaiApiKey;
        console.log('[Server] ✅ X.AI API key loaded from settings');
      }
      if (settings.deepgramApiKey) {
        env.DEEPGRAM_API_KEY = settings.deepgramApiKey;
        console.log('[Server] ✅ Deepgram API key loaded from settings');
      }
      
      // Apply other settings
      if (settings.defaultLLM) env.DEFAULT_LLM = settings.defaultLLM;

      // BYOK: Read encrypted API keys from electron-store (set via Settings/Onboarding UI).
      // These always take priority over .env and settings.json.
      const _ekOpenAI     = getApiKey('openai');
      const _ekOpenRouter = getApiKey('openrouter');
      const _ekAnthropic  = getApiKey('anthropic');
      const _ekGroq       = getApiKey('groq');
      const _ekDeepgram   = getApiKey('deepgram');
      const _ekGemini     = getApiKey('gemini');
      const _ekXAI        = getApiKey('xai');
      if (_ekOpenAI)     { env.OPENAI_API_KEY     = _ekOpenAI;     console.log('[Server] ✅ OpenAI key loaded from encrypted store'); }
      if (_ekOpenRouter) { env.OPENROUTER_API_KEY = _ekOpenRouter; console.log('[Server] ✅ OpenRouter key loaded from encrypted store'); }
      if (_ekAnthropic)  { env.ANTHROPIC_API_KEY  = _ekAnthropic;  console.log('[Server] ✅ Anthropic key loaded from encrypted store'); }
      if (_ekGroq)       { env.GROQ_API_KEY       = _ekGroq;       console.log('[Server] ✅ Groq key loaded from encrypted store'); }
      if (_ekDeepgram)   { env.DEEPGRAM_API_KEY   = _ekDeepgram;   console.log('[Server] ✅ Deepgram key loaded from encrypted store'); }
      if (_ekGemini)     { env.GEMINI_API_KEY     = _ekGemini;     console.log('[Server] ✅ Gemini key loaded from encrypted store'); }
      if (_ekXAI)        { env.XAI_API_KEY        = _ekXAI;        console.log('[Server] ✅ xAI key loaded from encrypted store'); }

      // Apply AI provider / model from electron-store
      const _storedAi = settingsStore.get('ai') || {};
      if (_storedAi.model && _storedAi.model.trim()) {
        env.DEFAULT_LLM = _storedAi.model;
        console.log(`[Server] ✅ DEFAULT_LLM = ${_storedAi.model} (from store)`);
      }
      const providerBaseUrls = {
        openrouter: 'https://openrouter.ai/api/v1',
        groq:       'https://api.groq.com/openai/v1',
        anthropic:  'https://api.anthropic.com/v1',
        gemini:     'https://generativelanguage.googleapis.com/v1beta/openai',
        openai:     'https://api.openai.com/v1',
      };
      if (providerBaseUrls[_storedAi.provider]) {
        env.OPENAI_BASE_URL = providerBaseUrls[_storedAi.provider];
      } else if (_storedAi.provider === 'ollama') {
        env.OLLAMA_BASE_URL = _storedAi.baseUrl || 'http://localhost:11434';
        if (!env.DEFAULT_LLM) env.DEFAULT_LLM = _storedAi.model || 'llama3';
      } else if (_storedAi.provider === 'custom' && _storedAi.baseUrl) {
        env.OPENAI_BASE_URL = _storedAi.baseUrl;
      }

      // Log final status of critical environment variables
      console.log('[Server] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[Server] Environment Variables Status:');
      const keys = [
        'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'DEEPGRAM_API_KEY',
        'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'XAI_API_KEY',
        'OPENAI_BASE_URL', 'DEFAULT_LLM', 'USE_STREAMING_TRANSCRIPTION',
        'STREAMING_PROVIDER', 'AI_TEMPERATURE', 'AUTO_COACH_ENABLED'
      ];
      keys.forEach(k => {
        if (env[k]) {
          // Mask API keys for security
          if (k.includes('API_KEY') || k.includes('_KEY')) {
            const val = env[k];
            const masked = val.substring(0, 8) + '...' + val.substring(val.length - 4);
            console.log(`[Server] ✅ ${k} = ${masked}`);
          } else {
            console.log(`[Server] ✅ ${k} = ${env[k]}`);
          }
        } else {
          console.log(`[Server] ❌ ${k} is NOT set`);
        }
      });
      console.log('[Server] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Check if at least one AI provider is configured
      const hasAIKey = env.OPENROUTER_API_KEY || env.OPENAI_API_KEY || 
                       env.ANTHROPIC_API_KEY || env.GROQ_API_KEY || env.XAI_API_KEY;
      if (!hasAIKey) {
        console.warn('[Server] ⚠️ WARNING: No AI API keys configured!');
        console.warn('[Server] ⚠️ Please add your API keys in Settings to enable AI features.');
        console.warn('[Server] ⚠️ App will use fallback HuggingFace model (slower, offline).');
      }
      
      const hasTranscriptionKey = env.DEEPGRAM_API_KEY;
      if (!hasTranscriptionKey) {
        console.warn('[Server] ⚠️ WARNING: No transcription API keys configured!');
        console.warn('[Server] ⚠️ Please add a Deepgram key in Settings for transcription.');
        console.warn('[Server] ⚠️ App will use local Whisper model (slower, but works offline).');
      }
    } catch (e) {
      console.error('[Server] ❌ Could not load settings:', e.message);
      console.error('[Server] Stack:', e.stack);
    }
    
    serverProcess = spawn(py, [serverPath], { cwd: getPythonScriptsRoot(), env });
    attachServerIO();
  })().catch(err => console.error('[Server] setup error', err));
}

function attachServerIO() {
  let serverReady = false;
  serverProcess.stdout.setEncoding('utf8');
  serverProcess.stdout.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/).filter(Boolean);
    lines.forEach(l => {
      console.log(`[py] ${l}`);
      const m = l.match(/listening on ws:\/\/[^:]+:(\d+)/i);
      if (m) {
        serverPort = parseInt(m[1], 10) || serverPort;
        try { fs.writeFileSync(path.join(__dirname, '..', '.server-port'), String(serverPort)); } catch {}
        if (!serverReady) {
          serverReady = true;
          sendSetupProgress(100, 'Ready!', `Server started on port ${serverPort}`, 'ok');
          // Close setup window after brief delay, then show toolbar for returning users.
          setTimeout(() => {
            showToolbarWhenReady();
          }, 600);
        }
      }
    });
  });
  serverProcess.stderr.setEncoding('utf8');
  serverProcess.stderr.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/).filter(Boolean);
    lines.forEach(l => {
      console.error(`[py.err] ${l}`);
      const m = l.match(/listening on ws:\/\/[^:]+:(\d+)/i);
      if (m) {
        serverPort = parseInt(m[1], 10) || serverPort;
        try { fs.writeFileSync(path.join(__dirname, '..', '.server-port'), String(serverPort)); } catch {}
        console.log(`[Server] Detected port ${serverPort}, wrote to .server-port`);
        if (!serverReady) {
          serverReady = true;
          sendSetupProgress(100, 'Ready!', `Server started on port ${serverPort}`, 'ok');
          setTimeout(() => {
            showToolbarWhenReady();
          }, 600);
        }
      }
    });
  });
  serverProcess.on('exit', (code, signal) => {
    console.log(`[Server] Exited code=${code} signal=${signal}`);
    serverProcess = null;
  });
}

// Heartbeat broadcast (UI can show server + app status)
function startHeartbeat() {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    try {
      sendToUi('app-heartbeat', {
        ts: Date.now(),
        serverRunning: !!serverProcess,
        overlays: overlayWindows.length,
        toolbarVisible: !!(toolbarWindow && !toolbarWindow.isDestroyed() && toolbarWindow.isVisible())
      });
    } catch (e) {
      console.error('Heartbeat send failed', e.message);
    }
  }, 5000);
}

function createStealthOverlay() {
  // Tear down existing overlays
  overlayWindows.forEach(w => { 
    try { 
      w.close(); 
    } catch (e) {
      console.log('Error closing overlay:', e.message);
    }
  });
  overlayWindows = [];

  const displays = screen.getAllDisplays();
  for (const d of displays) {
    const { x, y, width, height } = d.bounds;
    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      transparent: true,
      frame: false,
      resizable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // Ensure mouse events are properly ignored
    try {
      win.setIgnoreMouseEvents(true);
      win.setIgnoreMouseEvents(true, { forward: true }); // Forward events to underlying windows
      console.log('Mouse events set to ignore for overlay window');
    } catch (e) {
      console.log('Could not set ignore mouse events:', e.message);
    }
    
    try {
      win.setContentProtection(true);
    } catch (e) {
      console.log('Content protection not available for overlay');
    }

    // Load overlay content
    win.loadURL('data:text/html,<body style="background:transparent;margin:0;padding:0;"></body>');
    
    if (overlayDebug) {
      win.webContents.openDevTools();
    }

    overlayWindows.push(win);
  }

  console.log(`Created ${overlayWindows.length} stealth overlay(s)`);
}

// ==========================================
// Credits/activation system removed in free BYOK mode.
// ==========================================


/**
 * Free BYOK mode: always create toolbar without credit/activation checks.
 */
function createToolbarWithCreditCheck() {
  console.log('[BYOK] Free BYOK mode - creating toolbar without credit/activation check');
  createToolbarWindow();
  return true;
}

// Lightweight floating toolbar window
function createToolbarWindow() {
  if (toolbarWindow && !toolbarWindow.isDestroyed()) {
    try {
      toolbarWindow.show();
      toolbarWindow.focus();
    } catch {}
    return toolbarWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Restore last known bounds or default to a reasonable position
  // Ensure data directory paths exist before attempting to read persisted bounds
  try { ensureDataPaths(); } catch (e) { console.error('ensureDataPaths failed before toolbar creation', e.message); }
  const lastBounds = dataDir ? readJSON(path.join(dataDir, 'toolbar-bounds.json'), null) : null;
  // Fixed dimensions for compact pill toolbar (adjust here if design changes)
  // Start with conservative width; will auto-shrink to content after load
  const defaultWidth = 640;
  const defaultHeight = 90; // increased to show button labels

  toolbarWindow = new BrowserWindow({
    x: lastBounds ? lastBounds.x : width - defaultWidth - 20,
    y: lastBounds ? lastBounds.y : 20,
    width: lastBounds ? lastBounds.width : defaultWidth,
    height: lastBounds ? lastBounds.height : defaultHeight,
    transparent: true,
    frame: false,
    resizable: false, // fixed pill size
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
  // Must be focusable so that text inputs (chat, prompt) can receive keyboard events
  focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  try { toolbarWindow.setAlwaysOnTop(true, 'screen-saver'); } catch {}
  try { toolbarWindow.setContentProtection(true); } catch {}

  // Correct path resolution (previous relative path was incorrect when launched from electron dir)
  const toolbarHtmlPath = path.join(__dirname, '../renderer/toolbar.html');
  try {
    toolbarWindow.loadFile(toolbarHtmlPath);
  } catch (e) {
    console.error('Failed to load toolbar HTML at', toolbarHtmlPath, e.message);
    // Provide minimal fallback content so window is at least visible for debugging
    toolbarWindow.loadURL('data:text/html,<body style="margin:0;font-family:sans-serif;background:rgba(20,20,30,0.6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;">Toolbar load error</body>');
  }

  // Pass initial data
  toolbarWindow.webContents.on('did-finish-load', () => {
    try {
      const settings = readJSON(settingsPath, {});
      toolbarWindow.webContents.send('settings-loaded', settings);
      
      // Measure actual bar content and shrink window to snug fit (+8px padding for shadow)
      setTimeout(() => {
        if (!toolbarWindow || toolbarWindow.isDestroyed()) return;
        toolbarWindow.webContents.executeJavaScript(`(()=>{const b=document.querySelector('.bar');if(!b)return null;const r=b.getBoundingClientRect();return {w:Math.ceil(r.width)+8,h:Math.ceil(r.height)+8};})()`)
          .then(dim => {
            if(!dim) return;
            const b = toolbarWindow.getBounds();
            const targetW = Math.min(dim.w, screen.getPrimaryDisplay().workAreaSize.width - 20);
            const targetH = dim.h; // already includes padding buffer
            toolbarWindow.setBounds({ ...b, width: targetW, height: targetH });
          }).catch(()=>{});
      }, 60);
    } catch (e) {
      console.error('Failed post-load toolbar sizing', e.message);
    }
  });

  // By default allow interaction so user can drag/move the toolbar.
  // (Previously it was fully click-through which prevented moving it.)
  // Provide an optional pass-through mode when holding the Alt key: renderer can request via IPC.
  let passthrough = false;
  function applyPassthrough() {
    try {
      if (passthrough) {
        toolbarWindow.setIgnoreMouseEvents(true, { forward: true });
      } else {
        toolbarWindow.setIgnoreMouseEvents(false);
      }
    } catch (e) { console.error('Failed to apply toolbar passthrough state', e.message); }
  }
  applyPassthrough();

  ipcMain.removeHandler('toolbar-set-passthrough');
  ipcMain.handle('toolbar-set-passthrough', (_evt, value) => {
    passthrough = !!value;
    applyPassthrough();
    return { ok: true, passthrough };
  });

  // Allow renderer to request focus (e.g., when expanding chat)
  ipcMain.removeHandler('toolbar-focus');
  ipcMain.handle('toolbar-focus', () => {
    try {
      if (toolbarWindow && !toolbarWindow.isDestroyed()) {
        toolbarWindow.focus();
        return { ok: true };
      }
    } catch (e) { return { ok:false, error: e.message }; }
    return { ok:false, error: 'no-window' };
  });

  toolbarWindow.on('close', () => {
    try {
      const bounds = toolbarWindow.getBounds();
      writeJSON(path.join(dataDir, 'toolbar-bounds.json'), bounds);
    } catch (e) {
      console.error('Failed to save toolbar bounds:', e.message);
    }
  });

  toolbarWindow.on('closed', () => {
    toolbarWindow = null;
  });

  // Save bounds on move/resize
  const saveBounds = () => {
    try { toolbarBounds = toolbarWindow.getBounds(); } catch {}
  };
  toolbarWindow.on('move', saveBounds);
  // Resize is disabled, but keep listener in case future enables
  toolbarWindow.on('resize', saveBounds); // allow dynamic width fitting now

  // Keep toolbar fully on-screen (snap back if partially off after drag)
  toolbarWindow.on('moved', () => {
    try {
      const b = toolbarWindow.getBounds();
      const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
      let changed = false;
      if (b.x + b.width < 40) { b.x = 10; changed = true; }
      if (b.x > sw - 40) { b.x = sw - b.width - 10; changed = true; }
      if (b.y < 0) { b.y = 10; changed = true; }
      if (b.y > sh - 40) { b.y = sh - b.height - 10; changed = true; }
      if (changed) toolbarWindow.setBounds(b);
    } catch(e){ }
  });

  return toolbarWindow;
}

// CHANGED: Onboarding window for first-run (free BYOK mode)
let onboardingWindow = null;
function createOnboardingWindow() {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.focus();
    return onboardingWindow;
  }
  onboardingWindow = new BrowserWindow({
    width: 640,
    height: 700,
    resizable: false,
    center: true,
    title: 'Welcome to Interview AI',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  onboardingWindow.loadFile(path.join(__dirname, '../renderer/onboarding.html'));
  onboardingWindow.on('closed', () => { onboardingWindow = null; });
  return onboardingWindow;
}

// CHANGED: Settings window
let settingsWindow = null;
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }
  settingsWindow = new BrowserWindow({
    width: 700,
    height: 760,
    resizable: true,
    center: true,
    title: 'Settings — Interview AI',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
  return settingsWindow;
}

// CHANGED: Settings IPC handlers (BYOK mode)
ipcMain.handle('settings:get', (_event, key) => settingsStore.get(key));
ipcMain.handle('settings:set', (_event, key, value) => { settingsStore.set(key, value); return true; });
ipcMain.handle('settings:save-api-key', (_event, provider, key) => { saveApiKey(provider, key); return true; });
ipcMain.handle('settings:get-api-key', (_event, provider) => getApiKey(provider));
ipcMain.handle('settings:clear-all', () => { settingsStore.clear(); clearAllKeys(); return true; });
ipcMain.handle('settings:get-all', () => settingsStore.store);
ipcMain.handle('settings:has-ai-key', () => hasAnyAiKey());
ipcMain.handle('settings:has-deepgram-key', () => hasDeepgramKey());
ipcMain.handle('settings:open-window', () => { createSettingsWindow(); return true; });

ipcMain.handle('resume-current:get', () => {
  const current = settingsStore.get('resume.current', null);
  return { ok: true, resume: current || null };
});

ipcMain.handle('resume-current:set', (_event, payload = {}) => {
  try {
    const name = String(payload.name || '').trim();
    const content = String(payload.content || '').trim();
    if (!name || !content) return { ok: false, error: 'Resume name and content are required' };

    const maxBase64Bytes = 16 * 1024 * 1024;
    if (content.length > maxBase64Bytes) {
      return { ok: false, error: 'Resume must be 10MB or smaller' };
    }

    const resume = {
      name: name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 180),
      content,
      size: Number(payload.size) || null,
      type: String(payload.type || ''),
      updatedAt: new Date().toISOString(),
    };
    settingsStore.set('resume.current', resume);
    if (payload.notify !== false) sendToUi('resume-current-updated', resume);
    return { ok: true, resume: { name: resume.name, size: resume.size, type: resume.type, updatedAt: resume.updatedAt } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('resume-current:clear', (_event, options = {}) => {
  try {
    settingsStore.delete('resume.current');
    if (!options || options.notify !== false) sendToUi('resume-current-cleared');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Claude Account sign-in — opens system browser (Chrome) ──────────────────
const CLAUDE_OAUTH = {
  CLIENT_ID:    '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  AUTHORIZE_URL: 'https://claude.ai/oauth/authorize',
  TOKEN_URL:     'https://claude.ai/oauth/token',
  API_KEY_URL:   'https://api.anthropic.com/api/oauth/claude_cli/create_api_key',
  SCOPES:        'org:create_api_key user:profile',
};

// Small waiting window shown while the user authorises in Chrome.
let claudeAccountWindow = null;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = require('net').createServer();
    srv.listen(0, 'localhost', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
    srv.on('error', reject);
  });
}

ipcMain.handle('claude-account:sign-in', async (_event, apiKey) => {
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    return { ok: false, error: 'Invalid API key format' };
  }

  // Validate the key with a lightweight models list call
  try {
    const testRes = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    if (!testRes.ok) {
      const body = await testRes.text();
      return { ok: false, error: `Invalid API key (${testRes.status}): ${body.slice(0, 120)}` };
    }
  } catch (e) {
    return { ok: false, error: `Could not reach Anthropic API: ${e.message}` };
  }

  // Persist and restart Python server
  saveApiKey('claude_account', apiKey);
  saveApiKey('anthropic', apiKey);
  settingsStore.set('ai', {
    ...(settingsStore.get('ai') || {}),
    provider: 'anthropic',
    model: settingsStore.get('ai.model') || 'claude-sonnet-4-6',
  });
  try { if (serverProcess) serverProcess.kill(); } catch {}
  setTimeout(() => startServer().catch(() => {}), 800);

  return { ok: true };
});

ipcMain.handle('shell:open-external', (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

ipcMain.handle('claude-account:get-status', () => {
  const hasAccount = hasClaudeAccount();
  const key = hasAccount ? getApiKey('claude_account') : null;
  return {
    connected: hasAccount,
    maskedKey: key ? `sk-ant-...${key.slice(-6)}` : null,
  };
});

ipcMain.handle('claude-account:sign-out', () => {
  // Get the account key before deleting so we can also clear it from 'anthropic'
  const accountKey = getApiKey('claude_account');
  settingsStore.delete('keys.claude_account');
  // If the active anthropic key was the one we generated via OAuth, clear it too
  const anthropicKey = getApiKey('anthropic');
  if (accountKey && anthropicKey === accountKey) {
    settingsStore.delete('keys.anthropic');
    settingsStore.set('ai', { ...(settingsStore.get('ai') || {}), provider: null });
  }
  return { ok: true };
});
ipcMain.handle('onboarding:complete', () => {
  settingsStore.set('onboardingComplete', true);
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.close();
    onboardingWindow = null;
  }
  // Restart Python server so it picks up the API keys saved during onboarding
  if (serverProcess) {
    try { serverProcess.kill('SIGTERM'); } catch {}
    serverProcess = null;
  }
  setTimeout(() => {
    startPythonServer();
    setTimeout(() => createToolbarWindow(), 800);
  }, 400);
  return true;
});

// Ctrl+, shortcut to open settings (registered after window focus)
function registerSettingsShortcut() {
  try {
    globalShortcut.register('CommandOrControl+,', () => {
      createSettingsWindow();
    });
  } catch (e) {
    console.warn('[Settings] Could not register Ctrl+, shortcut:', e.message);
  }
}

function toggleToolbarWindow() {
  if (!toolbarWindow || toolbarWindow.isDestroyed()) {
    createToolbarWindow();
    return true;
  }
  const isVisible = toolbarWindow.isVisible();
  if (isVisible) {
    toolbarWindow.hide();
  } else {
    toolbarWindow.show();
    toolbarWindow.focus();
  }
  return !isVisible;
}

// Resize toolbar window from renderer request
function resizeToolbarWindow(contentHeight) {
  try {
    if (!toolbarWindow || toolbarWindow.isDestroyed()) return false;
    // Get current size and adjust height to bar + content padding
    const [curW] = toolbarWindow.getSize();
    // Clamp height to sensible bounds
    const minH = 72;
    const maxH = 600;
    const newH = Math.max(minH, Math.min(maxH, Math.round(contentHeight)));
    toolbarWindow.setSize(curW, newH, true);
    return true;
  } catch (e) {
    console.error('Failed to resize toolbar window:', e.message);
    return false;
  }
}

// Enhanced screen capture aiming for pixel-perfect full display image.
// Returns an object: { image: <base64 png>, width, height, displayId, scaleFactor }
// Still supports legacy usage where only base64 string is expected by returning .image when coerced.
async function captureScreen() {
  console.log('🔄 Starting screen capture (improved)...');
  // Prefer the display under the cursor to better match user intent
  const cursorPoint = screen.getCursorScreenPoint();
  const targetDisplay = screen.getDisplayNearestPoint(cursorPoint) || screen.getPrimaryDisplay();
  const { width: dispW, height: dispH } = targetDisplay.size; // physical size in screen coordinates
  const scaleFactor = targetDisplay.scaleFactor || 1; // device scale factor (DPI scaling)
  const targetW = Math.round(dispW * scaleFactor);
  const targetH = Math.round(dispH * scaleFactor);

  // Temporarily hide our overlays and toolbar to avoid occluding captured content
  const hiddenWindows = [];
  try {
    for (const w of overlayWindows) {
      try { if (w && !w.isDestroyed() && w.isVisible()) { hiddenWindows.push(w); w.hide(); } } catch {}
    }
    if (toolbarWindow && !toolbarWindow.isDestroyed() && toolbarWindow.isVisible()) {
      hiddenWindows.push(toolbarWindow);
      try { toolbarWindow.hide(); } catch {}
    }

    // First attempt: request native pixel size for the target display
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: targetW, height: targetH },
      fetchWindowIcons: false
    });
    if (!sources.length) throw new Error('No screen sources available');

    // Pick the source matching our target display id; fallback to the largest thumbnail
    let best = sources.find(s => String(s.display_id) === String(targetDisplay.id));
    if (!best) {
      best = sources
        .filter(s => s.thumbnail && !s.thumbnail.isEmpty())
        .sort((a, b) => (b.thumbnail.getSize().width * b.thumbnail.getSize().height) - (a.thumbnail.getSize().width * a.thumbnail.getSize().height))[0] || sources[0];
    }

    if (!best.thumbnail || best.thumbnail.isEmpty()) throw new Error('Empty screen thumbnail');

    let actual = best.thumbnail.getSize();
    let base64Image = best.thumbnail.toDataURL().split(',')[1];
    if (!base64Image) throw new Error('Failed to extract base64 image data');

    // If the OS provided a smaller image than requested, try a supersampled request
    if (actual.width < targetW || actual.height < targetH) {
      console.warn(`⚠️ Captured image smaller than requested (${actual.width}x${actual.height} vs ${targetW}x${targetH}). Retrying with supersample...`);
      try {
        const ssSources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: Math.round(targetW * 1.5), height: Math.round(targetH * 1.5) },
          fetchWindowIcons: false
        });
        let ssBest = ssSources.find(s => String(s.display_id) === String(targetDisplay.id)) || ssSources[0];
        if (ssBest && ssBest.thumbnail && !ssBest.thumbnail.isEmpty()) {
          actual = ssBest.thumbnail.getSize();
          base64Image = ssBest.thumbnail.toDataURL().split(',')[1] || base64Image;
        }
      } catch (e) {
        console.warn('Supersample retry failed:', e.message);
      }
    }

    const meta = {
      image: base64Image,
      width: actual.width,
      height: actual.height,
      requestedWidth: targetW,
      requestedHeight: targetH,
      displayId: best.display_id || String(targetDisplay.id),
      scaleFactor,
      sourceName: best.name || ''
    };
    if (base64Image.length < 5000) {
      console.warn('⚠️ Capture appears very small (<5KB) which may hurt OCR accuracy.');
    }
    console.log(`✅ Screen captured id=${meta.displayId} size=${actual.width}x${actual.height} (requested ${targetW}x${targetH}) scale=${scaleFactor} bytes=${base64Image.length}`);
    return meta;
  } catch (err) {
    console.error('❌ Screen capture failed (primary path):', err.message);
    // Attempt a conservative fallback (choose the largest available screen source at HD/2K)
    try {
      const fallbackSizes = [ { width: 2560, height: 1440 }, { width: 1920, height: 1080 } ];
      for (const fallbackSize of fallbackSizes) {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: fallbackSize,
          fetchWindowIcons: false
        });
        const candidate = sources
          .filter(s => s.thumbnail && !s.thumbnail.isEmpty())
          .sort((a, b) => (b.thumbnail.getSize().width * b.thumbnail.getSize().height) - (a.thumbnail.getSize().width * a.thumbnail.getSize().height))[0];
        if (candidate) {
          const b64 = candidate.thumbnail.toDataURL().split(',')[1];
          const actual = candidate.thumbnail.getSize();
          console.log('✅ Fallback capture successful at', actual.width, 'x', actual.height);
          return {
            image: b64,
            width: actual.width,
            height: actual.height,
            requestedWidth: fallbackSize.width,
            requestedHeight: fallbackSize.height,
            displayId: candidate.display_id || String(targetDisplay.id),
            scaleFactor: targetDisplay.scaleFactor || 1,
            sourceName: candidate.name || ''
          };
        }
      }
    } catch (fallbackError) {
      console.error('❌ Fallback capture also failed:', fallbackError.message);
    }
    throw err;
  } finally {
    // Restore UI elements we temporarily hid
    for (const w of hiddenWindows) {
      try { if (w && !w.isDestroyed()) w.showInactive(); } catch {}
    }
  }
}

// IPC handlers
ipcMain.handle('get-server-port', () => {
  return serverPort;
});

// NEW: Expose config to renderer process
ipcMain.handle('get-config', () => {
  console.log('[IPC] get-config request');
  return {
    cloudMode: config.cloudMode,
    serverUrl: config.serverUrl,
    useLocalServer: config.useLocalServer,
    environment: process.env.NODE_ENV || 'development'
  };
});

// List desktop capture sources (screens/windows) for system audio capture selection
ipcMain.handle('desktop-sources', async (_e, opts) => {
  try {
    const types = (opts && Array.isArray(opts.types) && opts.types.length) ? opts.types : ['screen','window'];
    const sources = await desktopCapturer.getSources({ types, fetchWindowIcons: false, thumbnailSize: { width: 80, height: 60 } });
    return { ok: true, sources: sources.map(s => ({ id: s.id, name: s.name, kind: s.id.split(':')[0] })) };
  } catch (e) {
    console.error('desktop-sources IPC failed', e);
    return { ok: false, error: e.message };
  }
});

// Optional: capture a specific source id (screen/window) for higher fidelity when provided
ipcMain.handle('capture-source', async (_e, sourceId) => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen','window'], thumbnailSize: { width: 2560, height: 1440 }, fetchWindowIcons: false });
    const found = sources.find(s => s.id === sourceId);
    if (!found || !found.thumbnail || found.thumbnail.isEmpty()) {
      return { ok: false, error: 'Source not found or empty thumbnail' };
    }
    const size = found.thumbnail.getSize();
    const image = found.thumbnail.toDataURL().split(',')[1] || '';
    return { ok: true, image, width: size.width, height: size.height, displayId: found.display_id || null, name: found.name };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Allow renderer (toolbar) to explicitly start the Python backend if not already running
ipcMain.handle('server-start', async () => {
  try {
    const wasRunning = !!serverProcess;
    if (!wasRunning) {
      startPythonServer();
      // Give server a short window to emit its port line
      await new Promise(r => setTimeout(r, 600));
    }
    return { ok: true, running: !!serverProcess, port: serverPort };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Allow renderer to restart the Python backend (e.g., after settings change)
ipcMain.handle('server-restart', async () => {
  try {
    console.log('[Server] Restart requested...');
    
    // Stop existing server if running
    if (serverProcess) {
      console.log('[Server] Stopping existing server...');
      serverProcess.kill('SIGTERM');
      serverProcess = null;
      serverPort = null;
      await new Promise(r => setTimeout(r, 500));
    }
    
    // Start fresh server with new settings
    console.log('[Server] Starting new server with updated settings...');
    startPythonServer();
    
    // Wait for server to be ready
    await new Promise(r => setTimeout(r, 1500));
    
    return { ok: true, running: !!serverProcess, port: serverPort };
  } catch (e) {
    console.error('[Server] Restart failed:', e);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('capture-screen', async () => {
  try {
    const result = await captureScreen();
    // Backwards compatibility: renderer expects base64 string in some paths.
    // If caller is legacy (no structured handling), they will treat object as [object Object] (not useful).
    // So we explicitly return only the base64 string but attach metadata via a prefixed JSON inside comment-like wrapper.
    // Simpler: always return the meta object; update renderer to read .image.
    return result; 
  } catch (error) {
    console.error('IPC capture-screen error:', error);
    return null;
  }
});

// Windows native capture for restricted applications
ipcMain.handle('capture-screen-windows', async (_e, options) => {
  try {
    const monitorIndex = options?.monitor || 0;
    const windowTitle = options?.windowTitle;
    
    // Send request to Python server for Windows native capture
    const ws = await ensureCoachWS();
    if (!ws || ws.readyState !== 1) {
      throw new Error('Server connection not available');
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Windows capture timeout'));
      }, 10000);
      
      const handler = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'ocr' && msg.method === 'windows') {
            clearTimeout(timeout);
            ws.removeListener('message', handler);
            resolve({
              success: true,
              text: msg.text,
              captureIndex: msg.captureIndex
            });
          }
        } catch (e) {
          // Ignore parse errors
        }
      };
      
      ws.on('message', handler);
      
      // Send capture request
      const request = {
        type: 'windows_capture',
        monitor: monitorIndex
      };
      
      if (windowTitle) {
        request.window_title = windowTitle;
      }
      
      ws.send(JSON.stringify(request));
    });
  } catch (error) {
    console.error('Windows capture error:', error);
    return { success: false, error: error.message };
  }
});

// List available windows for capture
ipcMain.handle('list-windows', async () => {
  try {
    const ws = await ensureCoachWS();
    if (!ws || ws.readyState !== 1) {
      throw new Error('Server connection not available');
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('List windows timeout'));
      }, 5000);
      
      const handler = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'windows_list') {
            clearTimeout(timeout);
            ws.removeListener('message', handler);
            resolve({
              success: true,
              windows: msg.windows || [],
              error: msg.error
            });
          }
        } catch (e) {
          // Ignore parse errors
        }
      };
      
      ws.on('message', handler);
      ws.send(JSON.stringify({ type: 'list_windows' }));
    });
  } catch (error) {
    console.error('List windows error:', error);
    return { success: false, error: error.message, windows: [] };
  }
});

ipcMain.handle('get-stealth-status', () => {
  const toolbarProtected = !!(toolbarWindow && !toolbarWindow.isDestroyed());
  return {
    contentProtection: toolbarProtected,
    stealthOverlay: overlayWindows.length > 0,
    platform: process.platform,
    // On Windows, WDA_EXCLUDEFROMCAPTURE hides window from screen captures.
    // On macOS, setContentProtection hides from screen recordings.
    // On Linux, this is a best-effort no-op.
    effectiveProtection: process.platform !== 'linux',
  };
});

ipcMain.handle('toggle-toolbar', () => {
  return toggleToolbarWindow();
});

ipcMain.handle('toggle-stealth', () => {
  if (overlayWindows.length > 0) {
    // Disable stealth mode
    overlayWindows.forEach(w => {
      try {
        w.close();
      } catch (e) {
        console.log('Error closing overlay:', e.message);
      }
    });
    overlayWindows = [];
    console.log('🥷 Stealth mode disabled');
    return false;
  } else {
    // Enable stealth mode
    createStealthOverlay();
    console.log('🥷 Stealth mode enabled');
    return true;
  }
});

// Toolbar controls
ipcMain.handle('toolbar-hide', () => {
  try {
    if (toolbarWindow && !toolbarWindow.isDestroyed()) {
      toolbarWindow.hide();
      return true;
    }
  } catch {}
  return false;
});

ipcMain.handle('toolbar-toggle', () => {
  try {
    return toggleToolbarWindow();
  } catch (e) {
    console.error('Toolbar toggle failed:', e.message);
    return false;
  }
});

ipcMain.handle('toolbar-resize', (_event, height) => {
  return resizeToolbarWindow(height);
});

// Resize both width and height (dynamic content auto-fit)
ipcMain.handle('toolbar-resize-dimensions', (_event, dims) => {
  try {
    if (!toolbarWindow || toolbarWindow.isDestroyed()) return false;
    const { x: curX, y: curY, width: curW, height: curH } = toolbarWindow.getBounds();
    const targetW = Math.max(220, Math.min(1600, Math.round(dims && dims.width ? dims.width : curW)));
    const targetH = Math.max(40, Math.min(800, Math.round(dims && dims.height ? dims.height : curH)));
    // Keep the pill's horizontal center fixed by adjusting x when width changes
    const pillCenterX = curX + Math.floor(curW / 2);
    let newX = pillCenterX - Math.floor(targetW / 2);
    const { width: screenW } = screen.getPrimaryDisplay().workAreaSize;
    newX = Math.max(0, Math.min(screenW - targetW, newX));
    toolbarWindow.setBounds({ x: newX, y: curY, width: targetW, height: targetH });
    return true;
  } catch (e) {
    console.error('toolbar-resize-dimensions failed', e.message);
    return false;
  }
});

// Misc helpers for renderer actions
ipcMain.handle('quit-app', () => {
  try {
    console.log('Quit app requested from renderer');
    app.quit();
    return true;
  } catch (e) {
    console.error('Failed to quit app:', e.message);
    return false;
  }
});

ipcMain.handle('open-external', (_event, url) => {
  try {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return true;
    }
  } catch (e) {
    console.error('open-external failed:', e.message);
  }
  return false;
});

ipcMain.handle('show-main', () => {
  try {
    ensureToolbarWindow({ focus: true, show: true });
    return true;
  } catch (e) {
    console.error('show-main failed:', e.message);
  }
  return false;
});

// Navigate to a logical section in the active desktop UI.
ipcMain.handle('navigate-section', (_event, section) => {
  try {
    return showPrimaryUi(section);
  } catch (e) {
    console.error('navigate-section failed:', e.message);
  }
  return false;
});

// ---------------- Profile & Resume Persistence IPC -----------------
ipcMain.handle('profile-load', () => {
  try { ensureDataPaths(); return readJSON(profilePath, {}); } catch (e) { return { error: e.message }; }
});

ipcMain.handle('profile-save', (_event, data) => {
  try {
    ensureDataPaths();
    const current = readJSON(profilePath, {});
    const merged = { ...current, ...data, updatedAt: new Date().toISOString() };
    writeJSON(profilePath, merged);
    return { ok: true, profile: merged };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('connections-load', () => {
  try { ensureDataPaths(); return readJSON(connectionsPath, { linkedin: false, github: false }); } catch (e) { return { error: e.message }; }
});


ipcMain.handle('connections-set', (_event, provider, value) => {
  try {
    ensureDataPaths();
    const data = readJSON(connectionsPath, { linkedin: false, github: false });
    if (provider in data) data[provider] = !!value; else data[provider] = !!value;
    writeJSON(connectionsPath, data);
    return { ok: true, connections: data };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('resumes-list', () => {
  try {
    ensureDataPaths();
    const meta = readJSON(resumesMetaPath, { resumes: [] });
    return meta.resumes || [];
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('resumes-upload', (_event, file) => {
  try {
    ensureDataPaths();
    if (!file || !file.name || !file.data) return { ok: false, error: 'Invalid file payload' };
    const resumesDir = path.join(dataDir, 'resumes');
    try { fs.mkdirSync(resumesDir, { recursive: true }); } catch {}
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const target = path.join(resumesDir, safeName);
    const buffer = Buffer.from(file.data, file.encoding === 'base64' ? 'base64' : undefined);
    // Compute SHA256 hash for duplicate detection
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    fs.writeFileSync(target, buffer);
    const sizeKB = Math.round(buffer.length / 1024);
    const meta = readJSON(resumesMetaPath, { resumes: [] });
    // Backfill existing entries missing hash (once)
    for (const r of meta.resumes) {
      if (!r.hash && r.path && fs.existsSync(r.path)) {
        try { r.hash = crypto.createHash('sha256').update(fs.readFileSync(r.path)).digest('hex'); } catch {}
      }
    }
    if (meta.resumes.some(r => r.hash === hash)) {
      // Duplicate: do not keep new file
      try { fs.unlinkSync(target); } catch {}
      return { ok: false, error: 'Duplicate resume detected' };
    }
    const entry = { id: Date.now().toString(36), name: safeName, path: target, sizeKB, uploadedAt: new Date().toISOString(), status: 'processing' };
    entry.hash = hash;
    meta.resumes.push(entry);
    writeJSON(resumesMetaPath, meta);
    logActivity('resume.upload', { id: entry.id, name: entry.name, sizeKB });
    // Simulate processing completion after short delay
    setTimeout(() => {
      try {
        const latest = readJSON(resumesMetaPath, { resumes: [] });
        const r = latest.resumes.find(r => r.id === entry.id);
        if (r) { r.status = 'processed'; writeJSON(resumesMetaPath, latest); }
        sendToUi('resumes-updated');
      } catch (e) { console.error('Finalize resume status failed', e.message); }
    }, 2000);
    return { ok: true, resume: entry };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('resumes-delete', (_event, id) => {
  try {
    ensureDataPaths();
    const meta = readJSON(resumesMetaPath, { resumes: [] });
    const idx = meta.resumes.findIndex(r => r.id === id);
    if (idx === -1) return { ok: false, error: 'Not found' };
    const [removed] = meta.resumes.splice(idx, 1);
    writeJSON(resumesMetaPath, meta);
    try { if (removed.path && fs.existsSync(removed.path)) fs.unlinkSync(removed.path); } catch {}
    parsedResumes.delete(id);
    // Remove semantic docs for this resume
    const remaining = [];
    for (const d of semanticIndex.docs) {
      if (d.rid === id) {
        for (const term of d.tf.keys()) {
          const cur = semanticIndex.df.get(term) || 0;
          if (cur > 1) semanticIndex.df.set(term, cur - 1); else semanticIndex.df.delete(term);
        }
        semanticIndex.totalDocs -= 1;
      } else {
        remaining.push(d);
      }
    }
    semanticIndex.docs = remaining;
    logActivity('resume.delete', { id, name: removed ? removed.name : '' });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('resumes-open', (_event, id) => {
  try {
    ensureDataPaths();
    const meta = readJSON(resumesMetaPath, { resumes: [] });
    const r = meta.resumes.find(r => r.id === id);
    if (!r) return { ok: false, error: 'Not found' };
    shell.openPath(r.path);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

// -------- Resume Parsing & Search (scaffolding) ---------
ipcMain.handle('resume-parse', async (_event, id) => {
  try {
    ensureDataPaths();
    const meta = readJSON(resumesMetaPath, { resumes: [] });
    const r = meta.resumes.find(r => r.id === id);
    if (!r) return { ok:false, error:'Not found' };
    if (!fs.existsSync(r.path)) return { ok:false, error:'File missing on disk' };
    const raw = fs.readFileSync(r.path);
    // Lightweight parse here; real embedding done by Python server (future)
    const text = raw.toString('utf8');
    const cleaned = text.replace(/\r/g,'').replace(/\n{3,}/g,'\n\n');
    // Simple chunking ~500 chars
    const paras = cleaned.split(/\n\n/).map(p=>p.trim()).filter(Boolean);
    const chunks=[]; let buf=[]; let size=0;
    for (const p of paras){
      if (size + p.length + 1 > 500 && buf.length){ chunks.push(buf.join('\n')); buf=[]; size=0; }
      buf.push(p); size += p.length + 1;
    }
    if (buf.length) chunks.push(buf.join('\n'));
    parsedResumes.set(id, { text: cleaned, chunks, meta:{ length: cleaned.length, chunks: chunks.length } });
    addSemanticDocs(id, chunks);
    const result = { ok:true, chunks: chunks.length, length: cleaned.length };
    logActivity('resume.parse', { id, chunks: chunks.length, length: cleaned.length });
    return result;
  } catch (e) { return { ok:false, error:e.message }; }
});

ipcMain.handle('resume-search', (_event, query, limit=5) => {
  try {
    if (!query || !query.trim()) return { ok:true, results:[] };
    const terms = tokenize(query);
    if (!terms.length) return { ok:true, results:[] };
    if (!semanticIndex.docs.length) {
      return { ok:true, results:[] };
    }
    // Query tf
    const qtf = new Map(); terms.forEach(t => qtf.set(t, (qtf.get(t)||0)+1));
    // Compute weights
    let qSumSq = 0;
    const qWeights = new Map();
    for (const [term, freq] of qtf.entries()) {
      const df = semanticIndex.df.get(term) || 0.5; // smoothing
      const idf = Math.log((1 + semanticIndex.totalDocs) / (1 + df)) + 1;
      const w = (1 + Math.log(freq)) * idf;
      qWeights.set(term, w);
      qSumSq += w * w;
    }
    const qNorm = Math.sqrt(qSumSq) || 1;
    const scored = [];
    for (const d of semanticIndex.docs) {
      let dot = 0;
      for (const [term, qW] of qWeights.entries()) {
        if (!d.tf.has(term)) continue;
        const df = semanticIndex.df.get(term) || 0.5;
        const idf = Math.log((1 + semanticIndex.totalDocs) / (1 + df)) + 1;
        const wDoc = (1 + Math.log(d.tf.get(term))) * idf;
        dot += qW * wDoc;
      }
      if (dot === 0) continue;
      // Approximate doc norm by recomputing idf component per term used (cheap for small query set)
      let docNormSq = 0;
      for (const [term, qW] of qWeights.entries()) {
        if (!d.tf.has(term)) continue;
        const df = semanticIndex.df.get(term) || 0.5;
        const idf = Math.log((1 + semanticIndex.totalDocs) / (1 + df)) + 1;
        const wDoc = (1 + Math.log(d.tf.get(term))) * idf;
        docNormSq += wDoc * wDoc;
      }
      const denom = qNorm * (Math.sqrt(docNormSq) || 1);
      const score = denom ? dot / denom : 0;
      if (score > 0) scored.push({ id: d.rid, snippet: d.text.slice(0, 280), score });
    }
    scored.sort((a,b)=> b.score - a.score);
    return { ok:true, results: scored.slice(0, limit) };
  } catch (e) { return { ok:false, error:e.message }; }
});

// ---------------- Settings IPC -----------------
ipcMain.handle('settings-load', () => {
  try {
    ensureDataPaths();
    const base = readJSON(settingsPath, {});
    // Merge masked representations from the encrypted store so the Settings
    // modal can show that a key exists (without revealing the full value).
    const storeToField = {
      openrouter: 'openrouterApiKey',
      openai:     'openaiApiKey',
      anthropic:  'anthropicApiKey',
      groq:       'groqApiKey',
      xai:        'xaiApiKey',
      deepgram:   'deepgramApiKey',
    };
    for (const [provider, field] of Object.entries(storeToField)) {
      if (!base[field]) {
        const stored = getApiKey(provider);
        if (stored) base[field] = stored; // return actual key so form can show it's set
      }
    }
    return base;
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('settings-save', (_event, patch) => {
  try {
    ensureDataPaths();
    const cur = readJSON(settingsPath, {});
    const merged = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    writeJSON(settingsPath, merged);

    // CRITICAL: Mirror API keys into the encrypted electron-store so that
    // toolbar.js BYOK flow (settings:get-api-key / settings:get-all) can
    // read them. The two storage systems must stay in sync.
    const keyMap = {
      openrouterApiKey: 'openrouter',
      openaiApiKey:     'openai',
      anthropicApiKey:  'anthropic',
      groqApiKey:       'groq',
      xaiApiKey:        'xai',
      deepgramApiKey:   'deepgram',
    };
    let detectedProvider = null;
    for (const [patchKey, storeProvider] of Object.entries(keyMap)) {
      if (patch[patchKey]) {
        saveApiKey(storeProvider, patch[patchKey]);
        if (!detectedProvider && storeProvider !== 'deepgram') {
          detectedProvider = storeProvider;
        }
      }
    }
    // Update the ai.provider in electron-store so settings:get-all returns it
    if (detectedProvider) {
      settingsStore.set('ai.provider', detectedProvider);
    }
    if (patch.defaultLLM) {
      settingsStore.set('ai.model', patch.defaultLLM);
    }

    sendToUi('settings-updated');
    logActivity('settings.save', { keys: Object.keys(patch||{}) });
    return { ok: true, settings: merged };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ---------------- Diagnostic IPC -----------------
ipcMain.handle('diagnostic:check-settings', () => {
  try {
    ensureDataPaths();
    const exists = fs.existsSync(settingsPath);
    const data = exists ? readJSON(settingsPath, {}) : null;
    return {
      exists,
      path: settingsPath,
      data: data ? {
        hasApiKey: !!data.apiKey,
        hasOpenRouterKey: !!data.openrouterApiKey,
        hasOpenAIKey: !!data.openaiApiKey,
        hasAnthropicKey: !!data.anthropicApiKey,
        hasGroqKey: !!data.groqApiKey,
        hasXAIKey: !!data.xaiApiKey,
        hasDeepgramKey: !!data.deepgramApiKey,
        defaultLLM: data.defaultLLM,
        autoLaunchServer: data.autoLaunchServer,
        stealthEnabled: data.stealthEnabled
      } : null
    };
  } catch (e) {
    return { exists: false, error: e.message };
  }
});

ipcMain.handle('diagnostic:check-server', () => {
  return {
    running: !!serverProcess,
    port: serverPort,
    pythonPath: serverProcess ? getPythonScriptsRoot() : null
  };
});

ipcMain.handle('diagnostic:check-env', () => {
  // Return status of critical environment variables (masked for security)
  const maskKey = (key) => {
    if (!key) return null;
    if (key.length <= 12) return '***';
    return key.substring(0, 8) + '...' + key.substring(key.length - 4);
  };
  
  return {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? maskKey(process.env.OPENROUTER_API_KEY) : null,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? maskKey(process.env.OPENAI_API_KEY) : null,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? maskKey(process.env.ANTHROPIC_API_KEY) : null,
    GROQ_API_KEY: process.env.GROQ_API_KEY ? maskKey(process.env.GROQ_API_KEY) : null,
    XAI_API_KEY: process.env.XAI_API_KEY ? maskKey(process.env.XAI_API_KEY) : null,
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY ? maskKey(process.env.DEEPGRAM_API_KEY) : null,
    DEFAULT_LLM: process.env.DEFAULT_LLM,
    USE_STREAMING_TRANSCRIPTION: process.env.USE_STREAMING_TRANSCRIPTION,
    STREAMING_PROVIDER: process.env.STREAMING_PROVIDER,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL
  };
});

// ---------------- Interviews IPC -----------------
function readInterviews() { ensureDataPaths(); return readJSON(interviewsPath, { interviews: [] }); }
function writeInterviews(data) { writeJSON(interviewsPath, data); }

ipcMain.handle('interviews-list', () => {
  try { return readInterviews().interviews; } catch (e) { return { error: e.message }; }
});

ipcMain.handle('interviews-create', (_event, payload) => {
  try {
    const data = readInterviews();
    const interview = {
      id: Date.now().toString(36),
      role: payload.role || 'Untitled Role',
      company: payload.company || 'Company',
      scheduledAt: payload.scheduledAt || new Date().toISOString(),
      durationMin: payload.durationMin || 15,
      status: 'upcoming',
      notes: '',
      createdAt: new Date().toISOString()
    };
    data.interviews.push(interview);
    writeInterviews(data);
    sendToUi('interviews-updated');
    logActivity('interview.create', { id: interview.id, role: interview.role, company: interview.company });
    return { ok: true, interview };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('interviews-update', (_event, id, patch) => {
  try {
    const data = readInterviews();
    const it = data.interviews.find(i => i.id === id);
    if (!it) return { ok: false, error: 'Not found' };
    Object.assign(it, patch, { updatedAt: new Date().toISOString() });
    writeInterviews(data);
    sendToUi('interviews-updated');
    logActivity(patch && patch.status === 'completed' ? 'interview.complete' : 'interview.update', { id, patch });
    return { ok: true, interview: it };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('interviews-delete', (_event, id) => {
  try {
    const data = readInterviews();
    const idx = data.interviews.findIndex(i => i.id === id);
    if (idx === -1) return { ok: false, error: 'Not found' };
    data.interviews.splice(idx, 1);
    writeInterviews(data);
    sendToUi('interviews-updated');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ---------------- Interview Live Session (simple timer) -----------------
let activeInterviewSession = null; // { id, startedAt, elapsedSec }
let interviewTickInterval = null;

ipcMain.handle('interview-start-session', async (_event, id) => {
  try {
    const data = readInterviews();
    const it = data.interviews.find(i => i.id === id);
    if (!it) return { ok:false, error:'Not found' };
    if (activeInterviewSession && activeInterviewSession.id !== id) {
      // Auto-stop previous
      clearInterval(interviewTickInterval); interviewTickInterval = null;
      activeInterviewSession = null;
    }
    if (it.status === 'completed') return { ok:false, error:'Already completed' };
    
    activeInterviewSession = { id, startedAt: Date.now(), elapsedSec:0 };
    
    // Tick interval - updates UI every second
    if (interviewTickInterval) { clearInterval(interviewTickInterval); }
    interviewTickInterval = setInterval(() => {
      if (!activeInterviewSession) return;
      activeInterviewSession.elapsedSec = Math.floor((Date.now() - activeInterviewSession.startedAt)/1000);
      try { sendToUi('interview-session-tick', { id, elapsedSec: activeInterviewSession.elapsedSec }); } catch {}
    }, 1000);
    
    logActivity('interview.session.start', { id });
    return { ok:true, session: activeInterviewSession };
  } catch (e) { return { ok:false, error:e.message }; }
});

ipcMain.handle('interview-end-session', async (_event, id, options) => {
  try {
    if (!activeInterviewSession || activeInterviewSession.id !== id) return { ok:false, error:'No active session' };
    
    clearInterval(interviewTickInterval); interviewTickInterval = null;

    const durationSec = activeInterviewSession.elapsedSec;
    activeInterviewSession = null;
    const data = readInterviews();
    const it = data.interviews.find(i => i.id === id);
    if (it) {
      it.status = 'completed';
      it.completedAt = new Date().toISOString();
      it.actualDurationSec = durationSec;
      if (options && options.notes) {
        it.notes = (it.notes||'') + (it.notes?'\n':'') + options.notes;
      }
      writeInterviews(data);
      sendToUi('interviews-updated');
    }
    
    logActivity('interview.session.end', { id, durationSec });
    return { ok:true, durationSec };
  } catch (e) { return { ok:false, error:e.message }; }
});



ipcMain.handle('interview-append-note', (_event, id, note) => {
  try {
    const data = readInterviews();
    const it = data.interviews.find(i => i.id === id);
    if (!it) return { ok:false, error:'Not found' };
    it.notes = (it.notes||'') + (it.notes?'\n':'') + note;
    writeInterviews(data);
    sendToUi('interviews-updated');
    logActivity('interview.note', { id, size: (note||'').length });
    return { ok:true };
  } catch (e) { return { ok:false, error:e.message }; }
});

// Interview coach suggestion (AI assist) IPC
ipcMain.handle('interview-coach-suggest', async (_event, payload) => {
  try {
    const { id, question } = payload || {};
    const ws = await ensureCoachWS();
    if (!ws || ws.readyState !== 1) return { ok:false, error:'Coach service not connected' };
    const q = (question && question.trim()) || 'Provide a concise coaching suggestion to improve interview performance.';
    ws.send(JSON.stringify({ type:'coach', question: q }));
    logActivity('interview.coach.suggest', { id, question: q.slice(0,160) });
    return { ok:true };
  } catch (e) { return { ok:false, error:e.message }; }
});

// -------------- Activity Feed IPC --------------
ipcMain.handle('activity-list', (_event, limit=50) => {
  try {
    const data = readActivities();
    const list = (data.activities||[]).slice().sort((a,b)=> (a.ts||'').localeCompare(b.ts||'')).reverse();
    return { ok:true, activities: list.slice(0, limit) };
  } catch (e) { return { ok:false, error:e.message }; }
});

// -------------- Credits System IPC (free BYOK stubs) --------------
const FREE_BYOK_CREDITS = { remaining: 9999, used: 0, total: 9999, planType: 'free-byok' };
ipcMain.handle('credits-load', () => ({ ok: true, credits: FREE_BYOK_CREDITS }));
ipcMain.handle('credits-sync', async () => ({ ok: true, credits: FREE_BYOK_CREDITS }));
ipcMain.handle('credits-check', () => ({ ok: true, hasCredits: true, credits: FREE_BYOK_CREDITS }));
ipcMain.handle('credits-start-session', () => ({ ok: true }));
ipcMain.handle('credits-end-session', () => ({ ok: true, success: true }));
ipcMain.handle('credits-get-active-session', () => ({ ok: true, session: null }));

// Free BYOK stubs - activation handlers return safe defaults
ipcMain.handle('desktop-is-activated', () => ({ activated: true }));
ipcMain.handle('desktop-get-activation-status', () => ({ ok: true, activated: true, planType: 'free-byok' }));
ipcMain.handle('desktop-get-user', () => ({ ok: true, user: null }));
ipcMain.handle('desktop-activate', async () => ({ success: true, hasCredits: true }));
ipcMain.handle('desktop-deactivate', () => ({ ok: true }));
ipcMain.handle('desktop-open-activation', () => { createSettingsWindow(); return { ok: true }; });
ipcMain.handle('close-activation-window', () => ({ ok: true }));
ipcMain.handle('desktop-get-credits', async () => ({ success: true, credits: FREE_BYOK_CREDITS }));
ipcMain.handle('desktop-sync-credits', async () => ({ success: true, credits: FREE_BYOK_CREDITS }));
ipcMain.handle('credits-available', () => ({ ok: true }));
ipcMain.handle('credits-add', () => ({ ok: true }));

// Relaunch app
ipcMain.handle('app-relaunch', () => {
  try { app.relaunch(); app.exit(0); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
});

// -------------- Compact Bar Download IPC --------------
ipcMain.handle('download-compact-bar', async (_event, type) => {
  try {
    const compactBarPath = path.join(__dirname, '../compact-bar-app/dist');
    let fileName = '';
    
    if (type === 'portable') {
      fileName = 'InterviewAI-CompactBar-Portable.exe';
    } else if (type === 'installer') {
      // Check for versioned installer file
      const installerPattern = 'Interview AI Compact Bar Setup';
      const files = fs.readdirSync(compactBarPath);
      const installerFile = files.find(f => f.startsWith(installerPattern) && f.endsWith('.exe'));
      fileName = installerFile || 'Interview AI Compact Bar Setup 1.0.0.exe';
    } else {
      return { success: false, error: 'Invalid download type' };
    }
    
    const sourcePath = path.join(compactBarPath, fileName);
    
    // Check if file exists
    if (!fs.existsSync(sourcePath)) {
      console.log(`Compact bar file not found: ${sourcePath}`);
      return { 
        success: false, 
        error: 'Compact bar not built yet. Please run: npm run build:compact-bar',
        needsBuild: true 
      };
    }
    
    console.log(`Found compact bar file: ${sourcePath}`);
    
    // Show save dialog
    const { dialog } = require('electron');
    const result = await showSaveDialogForApp(dialog, {
      title: 'Save Compact Bar',
      defaultPath: path.join(app.getPath('downloads'), fileName),
      filters: [
        { name: 'Executable', extensions: ['exe'] }
      ]
    });
    
    if (result.canceled) {
      console.log('Download cancelled by user');
      return { success: false, error: 'Cancelled' };
    }
    
    console.log(`Copying file to: ${result.filePath}`);
    
    // Copy file
    fs.copyFileSync(sourcePath, result.filePath);
    
    // Open folder
    shell.showItemInFolder(result.filePath);
    
    console.log('Download complete, folder opened');
    logActivity('compact-bar.download', { type, fileName });
    return { success: true, path: result.filePath };
  } catch (e) { 
    console.error('Download compact bar error:', e);
    return { success: false, error: e.message }; 
  }
});

// -------------- Main App Download IPC --------------
ipcMain.handle('download-main-app', async (_event, options = {}) => {
  try {
    // Expect the main app installer to be in project root dist/ after electron-builder
    const root = path.join(__dirname, '..');
    const distDir = path.join(root, 'dist');
    // Helper to locate installer
    const findInstaller = () => {
      if (!fs.existsSync(distDir)) return null;
      const files = fs.readdirSync(distDir);
      return files.find(f => /Interview\s*AI\s*Assistant.*\.exe$/i.test(f)) || files.find(f => f.endsWith('.exe')) || null;
    };

    let exe = findInstaller();
    // Auto-build if missing
    if (!exe) {
      if (buildingMainApp) {
        // Wait for ongoing build to finish (up to ~10 minutes)
        await new Promise((resolve) => {
          let waited = 0;
          const iv = setInterval(() => {
            const found = findInstaller();
            if (found) { clearInterval(iv); resolve(); return; }
            waited += 2000;
            if (waited >= 10 * 60 * 1000) { clearInterval(iv); resolve(); }
          }, 2000);
        });
        exe = findInstaller();
      } else {
        buildingMainApp = true;
        try {
          console.log('[Build] Desktop app not found, running npm run build...');
          await new Promise((resolve, reject) => {
            const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
            const p = spawn(cmd, ['run', 'build'], { cwd: root, shell: false });
            p.stdout.setEncoding('utf8');
            p.stderr.setEncoding('utf8');
            p.stdout.on('data', (d) => console.log('[build]', d.toString().trim()));
            p.stderr.on('data', (d) => console.error('[build.err]', d.toString().trim()));
            p.on('exit', (code) => {
              if (code === 0) resolve(); else reject(new Error('Build exited with code ' + code));
            });
            p.on('error', (err) => reject(err));
          });
        } catch (e) {
          console.error('[Build] Failed:', e.message);
          buildingMainApp = false;
          return { success: false, error: 'Build failed: ' + e.message };
        }
        buildingMainApp = false;
        exe = findInstaller();
      }
    }
    if (!exe) {
      return { success: false, error: 'Installer not found after build. Check build logs.' };
    }
    const sourcePath = path.join(distDir, exe);

    const { dialog } = require('electron');
    const result = await showSaveDialogForApp(dialog, {
      title: 'Save Interview AI Desktop App',
      defaultPath: path.join(app.getPath('downloads'), exe),
      filters: [ { name: 'Executable', extensions: ['exe'] } ]
    });
    if (result.canceled) {
      return { success: false, error: 'Cancelled' };
    }
    fs.copyFileSync(sourcePath, result.filePath);
    shell.showItemInFolder(result.filePath);
    logActivity('main-app.download', { fileName: exe });
    return { success: true, path: result.filePath };
  } catch (e) {
    console.error('Download main app error:', e);
    return { success: false, error: e.message };
  }
});

// Function to register all global shortcuts
function registerGlobalShortcuts() {
  // Unregister any existing shortcuts first to avoid conflicts
  globalShortcut.unregisterAll();
  
  console.log('[Shortcuts] Registering global keyboard shortcuts...');
  
  try {
    // Quick capture shortcut - Alt+C
    const captureRegistered = globalShortcut.register('Alt+C', async () => {
      console.log('🔥 [Shortcut] Quick capture triggered (Alt+C)');
      try {
        const image = await captureScreen();
        if (image) {
          sendToUi('quick-capture-result', image);
          
          // Also send directly to Python server for immediate AI analysis
          try {
            const ws = await ensureCoachWS();
            if (ws && ws.readyState === 1) {
              const imageData = typeof image === 'object' ? image.image : image;
              ws.send(JSON.stringify({
                type: "ocr",
                image: imageData,
                captureIndex: Date.now(), // Use timestamp as index
                autoAnalyze: true, // Flag for automatic analysis
                fastVision: true,
                meta: typeof image === 'object' ? {
                  width: image.width,
                  height: image.height,
                  requestedWidth: image.requestedWidth,
                  requestedHeight: image.requestedHeight,
                  displayId: image.displayId,
                  scaleFactor: image.scaleFactor,
                } : undefined,
              }));
              console.log('🔥 Quick capture sent to server for auto-analysis');
            }
          } catch (wsError) {
            console.error('Failed to send quick capture to server:', wsError);
          }
        }
      } catch (error) {
        console.error('Quick capture failed:', error);
      }
    });
    
    if (!captureRegistered) {
      console.error('❌ [Shortcuts] Failed to register Alt+C (may be in use by another app)');
    } else {
      console.log('✅ [Shortcuts] Alt+C registered (Quick capture)');
    }

    // Quick toggle stealth mode
    const stealthRegistered = globalShortcut.register('CommandOrControl+Shift+S', () => {
      console.log('🔥 [Shortcut] Quick stealth toggle triggered (Ctrl+Shift+S)');
      const isStealthActive = overlayWindows.length > 0;
      
      if (isStealthActive) {
        overlayWindows.forEach(w => {
          try {
            w.close();
          } catch (e) {
            console.log('Error closing overlay:', e.message);
          }
        });
        overlayWindows = [];
        console.log('🥷 Stealth mode disabled via shortcut');
      } else {
        createStealthOverlay();
        console.log('🥷 Stealth mode enabled via shortcut');
      }
      
      sendToUi('stealth-toggled', !isStealthActive);
    });
    
    if (!stealthRegistered) {
      console.error('❌ [Shortcuts] Failed to register Ctrl+Shift+S (may be in use by another app)');
    } else {
      console.log('✅ [Shortcuts] Ctrl+Shift+S registered');
    }

    // Toggle compact toolbar - Ctrl+/ (hide/unhide)
    const toolbarToggleRegistered = globalShortcut.register('CommandOrControl+/', () => {
      console.log('🔥 [Shortcut] Toolbar toggle triggered (Ctrl+/)');
      const visible = toggleToolbarWindow();
      console.log(`🧰 Compact toolbar ${visible ? 'shown' : 'hidden'} via shortcut`);
    });
    
    if (!toolbarToggleRegistered) {
      console.error('❌ [Shortcuts] Failed to register Ctrl+/ (may be in use by another app)');
    } else {
      console.log('✅ [Shortcuts] Ctrl+/ registered (Toggle toolbar hide/unhide)');
    }
    
    // Minimize window
    const minimizeRegistered = globalShortcut.register('CommandOrControl+M', () => {
      console.log('🔥 [Shortcut] Minimize triggered (Ctrl+M)');
      if (toolbarWindow && !toolbarWindow.isDestroyed() && toolbarWindow.isVisible()) {
        toolbarWindow.hide();
        console.log('🗕 Window minimized via shortcut');
      }
    });
    
    if (!minimizeRegistered) {
      console.error('❌ [Shortcuts] Failed to register Ctrl+M (may be in use by another app)');
    } else {
      console.log('✅ [Shortcuts] Ctrl+M registered');
    }

    // Toggle interviewer recording (system/output) shortcut
    const interviewerToggleRegistered = globalShortcut.register('CommandOrControl+Alt+I', () => {
      console.log('🔥 [Shortcut] Interviewer toggle triggered (Ctrl+Alt+I)');
      try {
        if (toolbarWindow && !toolbarWindow.isDestroyed()) {
          toolbarWindow.webContents.send('toggle-interviewer-recording');
          console.log('🎙️ Toggled interviewer recording via Ctrl+Alt+I');
        } else {
          console.log('Toolbar window not available for interviewer toggle');
        }
      } catch (e) {
        console.error('Interviewer toggle shortcut failed:', e.message);
      }
    });
    
    if (!interviewerToggleRegistered) {
      console.error('❌ [Shortcuts] Failed to register Ctrl+Alt+I (may be in use by another app)');
    } else {
      console.log('✅ [Shortcuts] Ctrl+Alt+I registered');
    }

    // Ask AI button - Ctrl+Q (capture and analyze)
    const askAIRegistered = globalShortcut.register('CommandOrControl+Q', async () => {
      console.log('🔥 [Shortcut] Ask AI triggered (Ctrl+Q)');
      try {
        // Ensure toolbar exists
        if (!toolbarWindow || toolbarWindow.isDestroyed()) {
          console.log('Creating toolbar window for Ask AI...');
          createToolbarWindow();
        }
        
        // Capture screen and send to toolbar
        const image = await captureScreen();
        if (image && toolbarWindow && !toolbarWindow.isDestroyed()) {
          // Send message to toolbar to trigger AI button click
          toolbarWindow.webContents.send('trigger-ask-ai');
          console.log('🤖 AI button triggered via Ctrl+Q');
        } else {
          console.log('❌ Toolbar window not available or capture failed');
        }
      } catch (e) {
        console.error('Ask AI shortcut failed:', e.message);
      }
    });
    
    if (!askAIRegistered) {
      console.error('❌ [Shortcuts] Failed to register Ctrl+Q (may be in use by another app)');
    } else {
      console.log('✅ [Shortcuts] Ctrl+Q registered (Ask AI)');
    }

    // Toolbar DevTools toggle (Ctrl+Alt+D)
    try {
      const registeredDev = globalShortcut.register('CommandOrControl+Alt+D', () => {
        console.log('🔥 [Shortcut] DevTools toggle triggered (Ctrl+Alt+D)');
        try {
          if (!toolbarWindow || toolbarWindow.isDestroyed()) {
            console.log('Toolbar window missing; creating before opening DevTools');
            createToolbarWindow();
          }
          if (!toolbarWindow) return;
          const wc = toolbarWindow.webContents;
          if (!wc.isDevToolsOpened()) {
            wc.openDevTools({ mode: 'detach' });
            console.log('🛠️ Toolbar DevTools opened');
          } else {
            wc.closeDevTools();
            console.log('🛠️ Toolbar DevTools closed');
          }
        } catch (e) {
          console.error('Toolbar DevTools toggle failed:', e.message);
        }
      });
      if (registeredDev) {
        console.log('✅ [Shortcuts] Ctrl+Alt+D registered (DevTools)');
      } else {
        console.error('❌ [Shortcuts] Ctrl+Alt+D registration failed (already in use)');
      }
    } catch (e) {
      console.error('Failed to register Ctrl+Alt+D shortcut:', e.message);
    }
    
    // CHANGED: Register settings shortcut (Ctrl+,)
  registerSettingsShortcut();
  
  // Summary of registered shortcuts
    console.log('\n📋 [Shortcuts] Registration Summary:');
    console.log('   Global shortcuts are registered and will work system-wide');
    console.log('   If a shortcut doesn\'t work, it may be captured by Windows or another app');
    console.log('   Check the console for "[Shortcut]" logs when pressing keys\n');

  } catch (error) {
    console.error('Failed to register global shortcuts:', error);
  }
}

// Enhanced app event handlers
app.whenReady().then(async () => {
  // CHANGED: No activation manager in free BYOK mode
  // CHANGED: Check if onboarding is complete; if not, show onboarding window first
  const onboardingComplete = settingsStore.get('onboardingComplete', false);
  
  try {
    startPythonServer();
  } catch (e) {
    console.error('Failed to auto-start server', e);
  }
  
  // OPEN-SOURCE MODE: Always run in BYOK (Bring Your Own Keys) mode
  console.log('[BYOK] Free BYOK mode - running locally with user-provided API keys');
  console.log('[BYOK] Configure your API keys in Settings (⚙️) to enable AI features');
  
  if (!onboardingComplete) {
    // Show onboarding window on first launch
    setTimeout(() => {
      console.log('[Onboarding] First launch detected - showing onboarding window');
      createOnboardingWindow();
    }, 800);
  } else {
    // Create toolbar directly for returning users
    setTimeout(() => {
      console.log('[BYOK] Returning user - creating toolbar...');
      createToolbarWindow();
    }, 1500);
  }
  
  startHeartbeat();
  // Unified permission handler: allow media + display-capture for system audio
  try {
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
      try {
        if (permission === 'media') {
          console.log('[Perm] media request', { mediaTypes: details && details.mediaTypes });
          // Always allow media (audio/video) for this app; upstream UI/logic will manage usage
          callback(true);
          return;
        }
        if (permission === 'display-capture') {
          console.log('[Perm] display-capture request approved');
          callback(true);
          return;
        }
        console.log('[Perm] denying permission', permission);
        callback(false);
      } catch (perr) {
        console.log('[Perm] handler error', perr.message);
        try { callback(false); } catch {}
      }
    });
  } catch (e) {
    console.log('Permission handler not available:', e.message);
  }
  
  // Create stealth overlays if enabled
  if (forcedStealth) {
    setTimeout(() => {
      createStealthOverlay();
    }, 2000);
  }

  // Register global shortcuts
  registerGlobalShortcuts();

  // App-level focus handlers to ensure shortcuts work when switching apps
  app.on('browser-window-focus', () => {
    console.log('[App] Browser window focused - verifying shortcuts');
    // Verify shortcuts are still registered when any window gets focus
    setTimeout(() => {
      const shortcuts = ['Alt+C', 'CommandOrControl+/', 'CommandOrControl+Q'];
      const anyUnregistered = shortcuts.some(s => !globalShortcut.isRegistered(s));
      if (anyUnregistered) {
        console.log('[App] Some shortcuts were unregistered, re-registering all...');
        registerGlobalShortcuts();
      }
    }, 50);
  });

  app.on('browser-window-blur', () => {
    console.log('[App] Browser window lost focus');
  });

  // IPC handler to open toolbar devtools from renderer (e.g., F12 inside toolbar)
  try {
    ipcMain.handle('toolbar-open-devtools', () => {
      try {
        if (!toolbarWindow || toolbarWindow.isDestroyed()) createToolbarWindow();
        if (toolbarWindow && !toolbarWindow.webContents.isDevToolsOpened()) {
          toolbarWindow.webContents.openDevTools({ mode: 'detach' });
          return { ok: true, opened: true };
        } else if (toolbarWindow) {
          toolbarWindow.webContents.closeDevTools();
          return { ok: true, opened: false };
        }
      } catch (e) {
        return { ok: false, error: e.message };
      }
      return { ok: false, error: 'No toolbar window' };
    });
  } catch (e) {
    console.error('Failed to register toolbar-open-devtools IPC:', e.message);
  }
  
  // IPC handler to check registered shortcuts
  try {
    ipcMain.handle('check-shortcuts', () => {
      try {
        const shortcuts = [
          'Alt+C',
          'CommandOrControl+/',
          'CommandOrControl+Q',
          'CommandOrControl+Shift+S',
          'CommandOrControl+M',
          'CommandOrControl+Alt+I',
          'CommandOrControl+Alt+D'
        ];
        
        const registered = shortcuts.map(shortcut => ({
          shortcut,
          registered: globalShortcut.isRegistered(shortcut)
        }));
        
        console.log('[Shortcuts] Status check:', registered);
        return { ok: true, shortcuts: registered };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
  } catch (e) {
    console.error('Failed to register check-shortcuts IPC:', e.message);
  }

  // Handle display changes
  screen.on('display-added', () => {
    console.log('Display added, recreating overlays...');
    if (forcedStealth || overlayWindows.length > 0) {
      createStealthOverlay();
    }
  });

  screen.on('display-removed', () => {
    console.log('Display removed, recreating overlays...');
    if (forcedStealth || overlayWindows.length > 0) {
      createStealthOverlay();
    }
  });

  // Handle system sleep/wake
  powerMonitor.on('suspend', () => {
    console.log('System suspended');
  });

  powerMonitor.on('resume', () => {
    console.log('System resumed, checking overlays...');
    if (forcedStealth || overlayWindows.length > 0) {
      setTimeout(() => {
        createStealthOverlay();
      }, 1000);
    }
  });
});

app.on('window-all-closed', () => {
  // Clean up global shortcuts
  globalShortcut.unregisterAll();
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
  
  // Clean up overlays
  overlayWindows.forEach(w => {
    try {
      w.close();
    } catch (e) {
      console.log('Error closing overlay on quit:', e.message);
    }
  });
  // Clean up toolbar
  try {
    if (toolbarWindow && !toolbarWindow.isDestroyed()) {
      toolbarWindow.destroy();
    }
  } catch {}
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (isOnboardingComplete()) {
    ensureToolbarWindow({ focus: true, show: true });
  } else {
    createOnboardingWindow();
  }
  // Re-register shortcuts to ensure they work after app activation
  registerGlobalShortcuts();
});

app.on('before-quit', () => {
  console.log('Application quitting...');
  
  // Clean up resources
  globalShortcut.unregisterAll();
  overlayWindows.forEach(w => {
    try {
      w.close();
    } catch (e) {
      console.log('Error closing overlay during quit:', e.message);
    }
  });
  try {
    if (toolbarWindow && !toolbarWindow.isDestroyed()) {
      toolbarWindow.destroy();
    }
  } catch {}
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
});

// Handle certificate errors (for development)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (url.startsWith('https://localhost')) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    console.log('Blocked new window:', navigationUrl);
  });
});

console.log('🚀 Electron main process loaded');
console.log('📱 Enhanced Interview AI Assistant with modern UI');
console.log('🔧 Features: Screen capture, Stealth mode, Global shortcuts');
console.log('🧰 Tip: Press Ctrl+Shift+T to toggle the compact toolbar');
