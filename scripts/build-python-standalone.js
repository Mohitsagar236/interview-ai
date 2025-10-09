/**
 * Build Python backend as standalone executable using PyInstaller
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const venvDir = path.join(rootDir, '.venv');
const pythonDir = path.join(rootDir, 'python');
const distDir = path.join(rootDir, 'python-dist');

function log(msg) {
  console.log(`[PyInstaller Build] ${msg}`);
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

async function installPyInstaller() {
  const venvPython = process.platform === 'win32' 
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
    
  if (!fs.existsSync(venvPython)) {
    throw new Error('Virtual environment not found. Run "npm run setup:py" first.');
  }
  
  log('Installing PyInstaller...');
  await runCommand(venvPython, ['-m', 'pip', 'install', 'pyinstaller']);
}

async function buildExecutable() {
  const venvPython = process.platform === 'win32' 
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
  
  const serverPath = path.join(pythonDir, 'server.py');
  
  if (!fs.existsSync(serverPath)) {
    throw new Error(`server.py not found at ${serverPath}`);
  }
  
  log('Building standalone executable with PyInstaller...');
  log('This may take a few minutes...');
  
  // PyInstaller arguments
  const args = [
    '-m', 'PyInstaller',
    '--onefile',
    '--name', 'interview-ai-server',
    '--distpath', distDir,
    '--workpath', path.join(rootDir, 'build-temp'),
    '--specpath', rootDir,
    '--clean',
    '--noconfirm',
    // Add data files if needed
    '--add-data', `${pythonDir};python`,
    serverPath
  ];
  
  await runCommand(venvPython, args, rootDir);
  
  log(`✅ Executable built successfully!`);
  log(`Location: ${path.join(distDir, 'interview-ai-server.exe')}`);
}

async function updatePackageJson() {
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Update build config to use standalone executable
  if (!packageJson.build.extraResources) {
    packageJson.build.extraResources = [];
  }
  
  // Remove old Python bundling configs
  packageJson.build.extraResources = packageJson.build.extraResources.filter(
    res => !res.from || !res.from.includes('python')
  );
  
  // Add standalone executable
  packageJson.build.extraResources.push({
    from: 'python-dist/',
    to: 'python-dist',
    filter: ['**/*']
  });
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  log('Updated package.json build configuration');
}

async function main() {
  try {
    log('Starting PyInstaller build process...');
    
    await installPyInstaller();
    await buildExecutable();
    await updatePackageJson();
    
    log('');
    log('═══════════════════════════════════════════════════════════');
    log('✅ PyInstaller build complete!');
    log('');
    log('Next steps:');
    log('1. Update electron/main.js to use the standalone executable');
    log('2. Run "npm run build" to create the final installer');
    log('═══════════════════════════════════════════════════════════');
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

main();
