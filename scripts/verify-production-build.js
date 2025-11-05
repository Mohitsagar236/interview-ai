const fs = require('fs');
const path = require('path');

console.log('\n🔍 PRODUCTION BUILD VERIFICATION\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const checks = [
  {
    name: 'Icons',
    items: [
      { file: 'assets/icon.ico', desc: 'Windows icon', required: true },
      { file: 'assets/icon.png', desc: 'Linux icon', required: true },
      { file: 'assets/icon.iconset', desc: 'macOS icon source', required: true, isDir: true },
    ]
  },
  {
    name: 'Python Backend',
    items: [
      { file: 'python-dist/interview-ai-server.exe', desc: 'PyInstaller executable', required: true },
    ]
  },
  {
    name: 'Tesseract OCR (Bundled)',
    items: [
      { file: 'external-deps/tesseract/tesseract.exe', desc: 'Tesseract executable', required: true },
      { file: 'external-deps/tesseract/tessdata/eng.traineddata', desc: 'English language data', required: true },
      { file: 'external-deps/tesseract/tessdata/osd.traineddata', desc: 'Orientation/script data', required: true },
    ]
  },
  {
    name: 'Configuration',
    items: [
      { file: 'electron-builder-prod.json', desc: 'Production build config', required: true },
      { file: '.env', desc: 'Environment variables', required: false },
    ]
  },
  {
    name: 'Application Files',
    items: [
      { file: 'electron/main.js', desc: 'Main process', required: true },
      { file: 'electron/config.js', desc: 'App configuration', required: true },
      { file: 'public/index.html', desc: 'UI files', required: true },
      { file: 'package.json', desc: 'Package manifest', required: true },
    ]
  }
];

let allPassed = true;
let warnings = [];

checks.forEach(section => {
  console.log(`\n📦 ${section.name}:`);
  
  section.items.forEach(item => {
    const filePath = path.join(__dirname, '..', item.file);
    let exists = false;
    let size = 0;
    
    try {
      const stats = fs.statSync(filePath);
      exists = true;
      size = stats.size;
      
      if (item.isDir && !stats.isDirectory()) {
        exists = false;
      } else if (!item.isDir && stats.isDirectory()) {
        exists = false;
      }
    } catch (err) {
      exists = false;
    }
    
    const icon = exists ? '✅' : (item.required ? '❌' : '⚠️');
    const status = exists ? 'OK' : (item.required ? 'MISSING' : 'Optional - Not found');
    
    let sizeStr = '';
    if (exists && !item.isDir) {
      if (size > 1024 * 1024) {
        sizeStr = ` (${(size / (1024 * 1024)).toFixed(2)} MB)`;
      } else if (size > 1024) {
        sizeStr = ` (${(size / 1024).toFixed(2)} KB)`;
      } else {
        sizeStr = ` (${size} bytes)`;
      }
    }
    
    console.log(`  ${icon} ${item.desc}: ${status}${sizeStr}`);
    
    if (!exists && item.required) {
      allPassed = false;
    }
    
    if (!exists && !item.required) {
      warnings.push(`${item.desc} not found - ${item.file}`);
    }
  });
});

// Check electron-builder-prod.json configuration
console.log('\n\n⚙️  Configuration Validation:');
try {
  const configPath = path.join(__dirname, '..', 'electron-builder-prod.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Check if extraResources includes python-dist
  const hasPythonDist = config.extraResources?.some(r => 
    r.from === 'python-dist/' || r.from === 'python-dist'
  );
  
  // Check if python source is excluded
  const excludesPython = config.files?.some(f => f === '!python/**/*');
  
  // Check if .env is included
  const includesEnv = config.files?.includes('.env');
  
  console.log(`  ${hasPythonDist ? '✅' : '❌'} PyInstaller exe bundled (extraResources)`);
  console.log(`  ${excludesPython ? '✅' : '⚠️'} Raw Python source excluded`);
  console.log(`  ${includesEnv ? '✅' : '⚠️'} .env file included (optional)`);
  console.log(`  ${config.win?.icon ? '✅' : '❌'} Windows icon configured: ${config.win?.icon || 'N/A'}`);
  console.log(`  ${config.mac?.icon ? '✅' : '❌'} macOS icon configured: ${config.mac?.icon || 'N/A'}`);
  console.log(`  ${config.linux?.icon ? '✅' : '❌'} Linux icon configured: ${config.linux?.icon || 'N/A'}`);
  
  if (!hasPythonDist || !excludesPython) {
    allPassed = false;
  }
  
} catch (err) {
  console.log(`  ❌ Error reading config: ${err.message}`);
  allPassed = false;
}

// Summary
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (allPassed) {
  console.log('✅ ALL CHECKS PASSED!\n');
  console.log('🚀 Ready to build production installer:\n');
  console.log('   npm run build:prod\n');
} else {
  console.log('❌ SOME CHECKS FAILED!\n');
  console.log('Fix the issues above before building.\n');
  process.exit(1);
}

if (warnings.length > 0) {
  console.log('⚠️  Warnings:');
  warnings.forEach(w => console.log(`   • ${w}`));
  console.log('');
}

// Additional info
console.log('📋 Build Steps:');
console.log('   1. npm run generate-icons     (if icons changed)');
console.log('   2. npm run build:standalone   (rebuild Python exe if needed)');
console.log('   3. npm run build:prod         (create installer)');
console.log('');
