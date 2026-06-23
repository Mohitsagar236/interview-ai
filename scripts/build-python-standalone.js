/**
 * Build Python backend as a self-contained standalone executable using PyInstaller.
 * Output: python-dist/interview-ai-server[.exe]
 *
 * Usage:
 *   node scripts/build-python-standalone.js
 *   npm run build:prod   (runs this then electron-builder)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const venvDir = path.join(rootDir, '.venv');
const pythonDir = path.join(rootDir, 'python');
const distDir = path.join(rootDir, 'python-dist');
const portableRequirementsPath = path.join(pythonDir, 'requirements-portable.txt');
const fullRequirementsPath = path.join(pythonDir, 'requirements.txt');

function log(msg) { console.log(`[PyInstaller] ${msg}`); }
function warn(msg) { console.warn(`[PyInstaller] Warning: ${msg}`); }

function run(cmd, args, cwd = rootDir) {
  return new Promise((resolve, reject) => {
    log(`> ${cmd} ${args.join(' ')}`);
    const proc = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    proc.on('exit', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
    proc.on('error', reject);
  });
}

function findSystemPythonCandidates() {
  return process.platform === 'win32'
    ? [{ cmd: 'py', args: ['-3'] }, { cmd: 'python', args: [] }]
    : [{ cmd: 'python3', args: [] }, { cmd: 'python', args: [] }];
}

function canRun(cmd, args) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, [...args, '-V'], { stdio: 'ignore', shell: false });
    proc.on('error', () => resolve(false));
    proc.on('exit', code => resolve(code === 0));
  });
}

async function resolveSystemPython() {
  for (const candidate of findSystemPythonCandidates()) {
    if (await canRun(candidate.cmd, candidate.args)) {
      return candidate;
    }
  }
  return null;
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

async function ensureVenv() {
  const exe = process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');

  if (fs.existsSync(exe)) {
    return exe;
  }

  const sysPy = await resolveSystemPython();
  if (!sysPy) {
    throw new Error('Python 3 was not found. Install Python 3.10+ before building.');
  }

  log(`Creating build virtual environment at ${venvDir}`);
  await run(sysPy.cmd, [...sysPy.args, '-m', 'venv', venvDir]);
  return exe;
}

async function installBackendRequirements() {
  const py = await ensureVenv();
  const requirementsPath = fs.existsSync(portableRequirementsPath)
    ? portableRequirementsPath
    : fullRequirementsPath;

  if (!fs.existsSync(requirementsPath)) {
    throw new Error(`Python requirements not found at ${requirementsPath}`);
  }

  log(`Installing backend requirements from ${path.basename(requirementsPath)}...`);
  await run(py, ['-m', 'pip', 'install', '--upgrade', 'pip', 'wheel', 'setuptools']);
  await run(py, ['-m', 'pip', 'install', '-r', requirementsPath]);
}

async function installPyInstaller() {
  log('Installing/upgrading PyInstaller...');
  await run(venvPy(), ['-m', 'pip', 'install', '--upgrade', 'pyinstaller', 'pyinstaller-hooks-contrib']);
}

async function buildExecutable() {
  const py = venvPy();
  const serverPath = path.join(pythonDir, 'server.py');
  if (!fs.existsSync(serverPath)) throw new Error(`server.py not found at ${serverPath}`);

  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'build-temp'), { recursive: true });

  log('Building standalone executable - this may take several minutes...');

  // Collect all .py files in python/ as hidden imports so local modules are not missed.
  const pyFiles = fs.readdirSync(pythonDir)
    .filter(f => f.endsWith('.py') && f !== 'server.py')
    .map(f => f.replace('.py', ''));

  const hiddenImports = [
    'websockets', 'websockets.legacy', 'websockets.server',
    'dotenv', 'numpy', 'PIL', 'pypdf', 'docx',
    'httpx', 'deepgram', 'soundfile', 'mss', 'dxcam',
    'paddleocr', 'ppocr', 'paddle', 'cv2',
    'onnxruntime', 'pytesseract',
    'yaml', 'rapidfuzz', 'shapely', 'pyclipper',
    'win32api', 'win32con', 'win32gui',
    ...pyFiles
  ];

  const collectAll = [
    'paddleocr',
    'ppocr',
    'paddle',
    'cv2',
    'deepgram',
    'websockets'
  ];

  // Keep the public desktop build CPU/cloud-first. These packages are optional
  // developer experiments and can drag CUDA-only DLLs into PyInstaller when
  // they happen to be installed in a reused virtualenv.
  const excludedModules = [
    'bitsandbytes',
    'accelerate',
    'transformers',
    'torch',
    'torchvision',
    'torchaudio',
    'sentence_transformers',
    'faster_whisper',
    'ctranslate2',
    'faiss',
    'faiss_cpu',
    'easyocr',
    'tensorflow',
    'tensorflow_hub',
    'tensorflow_io',
    'keras'
  ];

  if (!fs.existsSync(portableRequirementsPath)) {
    warn('Portable requirements file is missing; build may include optional development dependencies.');
  }

  const args = [
    '-m', 'PyInstaller',
    '--onefile',
    '--name', 'interview-ai-server',
    '--distpath', distDir,
    '--workpath', path.join(rootDir, 'build-temp'),
    '--specpath', rootDir,
    '--clean',
    '--noconfirm',
    // Include the entire python/ directory as data.
    '--add-data', `${pythonDir}${path.delimiter}python`,
    // PaddleOCR and friends use dynamic imports and package data.
    ...collectAll.flatMap(m => ['--collect-all', m]),
    // Explicitly exclude unused GPU/local-ML packages from stale dev venvs.
    ...excludedModules.flatMap(m => ['--exclude-module', m]),
    // Hidden imports.
    ...hiddenImports.flatMap(m => ['--hidden-import', m]),
    // Paths.
    '--paths', pythonDir,
    serverPath
  ];

  await run(py, args, rootDir);

  const outName = process.platform === 'win32' ? 'interview-ai-server.exe' : 'interview-ai-server';
  const outPath = path.join(distDir, outName);
  if (fs.existsSync(outPath)) {
    const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
    log(`Executable built: ${outPath} (${sizeMB} MB)`);
  } else {
    throw new Error('Executable not found after build - check PyInstaller output above.');
  }
}

async function main() {
  try {
    log('==================================================');
    log('   Interview AI - Python Standalone Build');
    log('==================================================');
    await installBackendRequirements();
    await installPyInstaller();
    await buildExecutable();
    log('');
    log('Python backend is ready for Electron packaging.');
  } catch (err) {
    console.error('Build failed:', err.message);
    process.exit(1);
  }
}

main();
