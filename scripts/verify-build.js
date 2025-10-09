/**
 * Test script to verify that the built app will work correctly
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const checks = [];
let passedChecks = 0;
let totalChecks = 0;

function check(name, condition, helpMessage) {
  totalChecks++;
  if (condition) {
    console.log(`✅ ${name}`);
    passedChecks++;
    return true;
  } else {
    console.log(`❌ ${name}`);
    if (helpMessage) {
      console.log(`   → ${helpMessage}`);
    }
    return false;
  }
}

function checkExists(filepath) {
  return fs.existsSync(filepath);
}

function checkDirectory(dirpath) {
  if (!fs.existsSync(dirpath)) return false;
  const files = fs.readdirSync(dirpath);
  return files.length > 0;
}

console.log('🔍 Verifying Build Setup...\n');

// Check 1: Virtual environment
const venvPath = path.join(rootDir, '.venv');
const venvPython = path.join(venvPath, 'Scripts', 'python.exe');
check(
  'Virtual environment exists',
  checkExists(venvPython),
  'Run: npm run setup:py'
);

// Check 2: Site packages
const sitePackages = path.join(venvPath, 'Lib', 'site-packages');
check(
  'Site-packages directory has content',
  checkDirectory(sitePackages),
  'Run: npm run setup:py'
);

// Check 3: Key Python packages
const requiredPackages = ['fastapi', 'uvicorn', 'websockets', 'pydantic'];
let hasAllPackages = true;
if (checkExists(sitePackages)) {
  const files = fs.readdirSync(sitePackages);
  for (const pkg of requiredPackages) {
    if (!files.some(f => f.toLowerCase().includes(pkg))) {
      hasAllPackages = false;
      break;
    }
  }
}
check(
  'Required Python packages installed',
  hasAllPackages,
  'Run: npm run setup:py'
);

// Check 4: Python files
const pythonDir = path.join(rootDir, 'python');
const serverPy = path.join(pythonDir, 'server.py');
check(
  'Python server.py exists',
  checkExists(serverPy),
  'Ensure python/server.py is present'
);

// Check 5: Electron files
const electronDir = path.join(rootDir, 'electron');
const mainJs = path.join(electronDir, 'main.js');
check(
  'Electron main.js exists',
  checkExists(mainJs),
  'Ensure electron/main.js is present'
);

// Check 6: Renderer files
const rendererDir = path.join(rootDir, 'renderer');
check(
  'Renderer directory exists',
  checkDirectory(rendererDir),
  'Ensure renderer/ directory has files'
);

// Check 7: Package.json build config
const packageJsonPath = path.join(rootDir, 'package.json');
let hasBuildConfig = false;
let hasExtraResources = false;
if (checkExists(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  hasBuildConfig = !!packageJson.build;
  hasExtraResources = !!(packageJson.build && packageJson.build.extraResources);
}
check(
  'package.json has build configuration',
  hasBuildConfig,
  'Check package.json "build" section'
);

check(
  'package.json has extraResources config',
  hasExtraResources,
  'Check package.json "build.extraResources"'
);

// Check 8: Node modules
const nodeModulesPath = path.join(rootDir, 'node_modules');
check(
  'Node modules installed',
  checkDirectory(nodeModulesPath),
  'Run: npm install'
);

// Check 9: Electron-builder installed
const electronBuilderPath = path.join(nodeModulesPath, 'electron-builder');
check(
  'electron-builder is installed',
  checkExists(electronBuilderPath),
  'Run: npm install'
);

// Check 10: Check for PyInstaller option
const pythonDistDir = path.join(rootDir, 'python-dist');
const standaloneExe = path.join(pythonDistDir, 'interview-ai-server.exe');
const hasStandalone = checkExists(standaloneExe);
check(
  'Standalone executable exists (optional)',
  hasStandalone || true, // Don't fail if not using standalone
  hasStandalone ? 'Using standalone executable ✨' : 'Run: npm run build:standalone (for smaller builds)'
);

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passedChecks}/${totalChecks} checks passed`);
console.log('='.repeat(50));

if (passedChecks === totalChecks) {
  console.log('\n✅ All checks passed! Ready to build.');
  console.log('\nNext steps:');
  if (hasStandalone) {
    console.log('  npm run build          # Build with standalone exe');
  } else {
    console.log('  npm run build          # Build with bundled packages');
    console.log('  npm run build:standalone  # Or build with standalone exe (recommended)');
  }
  process.exit(0);
} else {
  console.log('\n⚠️  Some checks failed. Fix the issues above before building.');
  console.log('\nCommon fixes:');
  console.log('  npm install           # Install Node dependencies');
  console.log('  npm run setup:py      # Setup Python environment');
  process.exit(1);
}
