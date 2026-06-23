/**
 * Prepare the app for building by ensuring Python dependencies are ready
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const venvDir = path.join(rootDir, '.venv');
const pythonDir = path.join(rootDir, 'python');
const fullRequirementsPath = path.join(pythonDir, 'requirements.txt');
const portableRequirementsPath = path.join(pythonDir, 'requirements-portable.txt');

function log(msg) {
  console.log(`[Prepare Build] ${msg}`);
}

function runCommand(cmd, args, cwd = rootDir) {
  return new Promise((resolve, reject) => {
    log(`Running: ${cmd} ${args.join(' ')}`);
    const proc = spawn(cmd, args, { 
      cwd, 
      stdio: 'inherit',
      shell: true 
    });
    
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
    
    proc.on('error', reject);
  });
}

async function checkVenv() {
  const venvPython = process.platform === 'win32' 
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
    
  if (!fs.existsSync(venvPython)) {
    log('Virtual environment not found. Creating...');
    const sysPy = await resolveSystemPython();
    if (!sysPy) {
      throw new Error('No system Python found. Please install Python 3.x.');
    }
    await runCommand(sysPy.cmd, [...sysPy.args, '-m', 'venv', '.venv']);
    log('Virtual environment created.');
  } else {
    log('Virtual environment found.');
  }
  
  return venvPython;
}

async function installDependencies(pythonExe) {
  const requirementsPath = fs.existsSync(portableRequirementsPath)
    ? portableRequirementsPath
    : fullRequirementsPath;

  if (!fs.existsSync(requirementsPath)) {
    log('Warning: no Python requirements file found. Skipping dependency installation.');
    return;
  }
  
  log(`Installing Python dependencies from ${path.basename(requirementsPath)}...`);
  await runCommand(pythonExe, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  await runCommand(pythonExe, ['-m', 'pip', 'install', '-r', requirementsPath]);
  log('Dependencies installed successfully.');
}

async function verifyBuild() {
  log('Verifying build configuration...');
  
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  
  if (!packageJson.build) {
    throw new Error('No build configuration found in package.json');
  }
  
  if (!packageJson.build.extraResources) {
    throw new Error('No extraResources configuration found');
  }

  const resources = packageJson.build.extraResources;
  const hasPythonDist = resources.some(res => res.to === 'python-dist' && String(res.from || '').includes('python-dist'));
  if (!hasPythonDist) {
    throw new Error('Build must include python-dist as an extraResource. Run npm run build so the standalone backend is generated first.');
  }

  const hasTesseract = resources.some(res => res.to === 'tesseract' && String(res.from || '').includes('external-deps'));
  if (!hasTesseract && process.platform === 'win32') {
    log('Warning: bundled Tesseract resource not configured. OCR will rely on PaddleOCR/vision only.');
  }

  log('Build configuration is aligned with standalone Python packaging.');
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

async function main() {
  try {
    log('Starting build preparation...');
    
    const pythonExe = await checkVenv();
    await installDependencies(pythonExe);
    await verifyBuild();
    
    log('Build preparation complete. Run "npm run build:prod" to create the installer.');
  } catch (error) {
    console.error('Build preparation failed:', error.message);
    process.exit(1);
  }
}

main();
