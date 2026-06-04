/**
 * Build Python backend as a self-contained standalone executable using PyInstaller.
 * Output: python-dist/interview-ai-server[.exe]
 *
 * Usage:
 *   node scripts/build-python-standalone.js
 *   npm run build:portable   (runs this then electron-builder)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir  = path.join(__dirname, '..');
const venvDir  = path.join(rootDir, '.venv');
const pythonDir = path.join(rootDir, 'python');
const distDir  = path.join(rootDir, 'python-dist');

function log(msg)  { console.log(`[PyInstaller] ${msg}`); }
function warn(msg) { console.warn(`[PyInstaller] ⚠️  ${msg}`); }

function run(cmd, args, cwd = rootDir) {
  return new Promise((resolve, reject) => {
    log(`> ${cmd} ${args.join(' ')}`);
    const proc = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    proc.on('exit', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
    proc.on('error', reject);
  });
}

function venvPy() {
  const exe = process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
  if (!fs.existsSync(exe)) {
    throw new Error(`Virtual environment not found at ${venvDir}. Run "npm run setup:py" first.`);
  }
  return exe;
}

async function installPyInstaller() {
  log('Installing/upgrading PyInstaller…');
  await run(venvPy(), ['-m', 'pip', 'install', '--upgrade', 'pyinstaller']);
}

async function buildExecutable() {
  const py = venvPy();
  const serverPath = path.join(pythonDir, 'server.py');
  if (!fs.existsSync(serverPath)) throw new Error(`server.py not found at ${serverPath}`);

  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'build-temp'), { recursive: true });

  log('Building standalone executable — this may take several minutes…');

  // Collect all .py files in python/ as hidden imports so nothing is missed
  const pyFiles = fs.readdirSync(pythonDir)
    .filter(f => f.endsWith('.py') && f !== 'server.py')
    .map(f => f.replace('.py', ''));

  const hiddenImports = [
    'websockets', 'websockets.legacy', 'websockets.server',
    'dotenv', 'numpy', 'PIL', 'pypdf', 'docx',
    'httpx', 'deepgram', 'soundfile', 'mss',
    'paddleocr', 'paddlepaddle',
    'onnxruntime', 'pytesseract',
    'win32api', 'win32con', 'win32gui',
    ...pyFiles
  ];

  const args = [
    '-m', 'PyInstaller',
    '--onefile',
    '--name', 'interview-ai-server',
    '--distpath', distDir,
    '--workpath', path.join(rootDir, 'build-temp'),
    '--specpath', rootDir,
    '--clean',
    '--noconfirm',
    // Include the entire python/ directory as data
    '--add-data', `${pythonDir}${path.delimiter}python`,
    // Hidden imports
    ...hiddenImports.flatMap(m => ['--hidden-import', m]),
    // Paths
    '--paths', pythonDir,
    serverPath
  ];

  await run(py, args, rootDir);

  const outName = process.platform === 'win32' ? 'interview-ai-server.exe' : 'interview-ai-server';
  const outPath = path.join(distDir, outName);
  if (fs.existsSync(outPath)) {
    const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
    log(`✅ Executable built: ${outPath} (${sizeMB} MB)`);
  } else {
    throw new Error('Executable not found after build — check PyInstaller output above.');
  }
}

async function main() {
  try {
    log('═══════════════════════════════════════════════════');
    log('   Interview AI — Python Standalone Build');
    log('═══════════════════════════════════════════════════');
    await installPyInstaller();
    await buildExecutable();
    log('');
    log('Next step: run "npm run build:portable" to package the Electron app.');
  } catch (err) {
    console.error('❌ Build failed:', err.message);
    process.exit(1);
  }
}

main();
