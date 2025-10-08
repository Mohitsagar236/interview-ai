const { execSync } = require('child_process');

try {
  execSync('npm ls electron-builder >NUL 2>&1', { stdio: 'ignore' });
} catch (e) {
  // no-op
}

console.log('Postinstall complete');
