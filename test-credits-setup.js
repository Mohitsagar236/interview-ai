/**
 * Test Credits System
 * Verifies that all components are working correctly
 */

const fs = require('fs');
const path = require('path');

console.log('\n🧪 Testing Credits System\n');

// Test results
const results = {
    passed: [],
    failed: [],
    warnings: []
};

function test(name, fn) {
    try {
        const result = fn();
        if (result === true) {
            results.passed.push(name);
            console.log(`✅ ${name}`);
        } else if (result === null) {
            results.warnings.push(name);
            console.log(`⚠️  ${name}`);
        } else {
            results.failed.push(name);
            console.log(`❌ ${name}: ${result}`);
        }
    } catch (error) {
        results.failed.push(name);
        console.log(`❌ ${name}: ${error.message}`);
    }
}

console.log('📁 Checking files...\n');

// Check if files exist
test('Credits Manager exists', () => {
    return fs.existsSync(path.join(__dirname, 'electron', 'credits-manager.js'));
});

test('Migration SQL exists', () => {
    return fs.existsSync(path.join(__dirname, 'credits-migration.sql'));
});

test('Toolbar HTML updated', () => {
    const content = fs.readFileSync(path.join(__dirname, 'renderer', 'toolbar.html'), 'utf8');
    return content.includes('credits-display');
});

test('Toolbar JS updated', () => {
    const content = fs.readFileSync(path.join(__dirname, 'renderer', 'toolbar.js'), 'utf8');
    return content.includes('loadCredits');
});

test('Main.js updated', () => {
    const content = fs.readFileSync(path.join(__dirname, 'electron', 'main.js'), 'utf8');
    return content.includes('credits-load');
});

test('Payment verification updated', () => {
    const content = fs.readFileSync(path.join(__dirname, 'api', 'verify-razorpay-payment.js'), 'utf8');
    return content.includes('PLAN_CREDITS');
});

test('Profile HTML updated', () => {
    const content = fs.readFileSync(path.join(__dirname, 'public', 'profile.html'), 'utf8');
    return content.includes('credits-remaining');
});

test('Profile JS updated', () => {
    const content = fs.readFileSync(path.join(__dirname, 'public', 'profile.js'), 'utf8');
    return content.includes('updateCreditsUI');
});

console.log('\n📦 Checking dependencies...\n');

test('Supabase client installed', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    return packageJson.dependencies?.['@supabase/supabase-js'] !== undefined;
});

console.log('\n🔧 Checking configuration...\n');

test('Environment file exists', () => {
    return fs.existsSync(path.join(__dirname, '.env'));
});

test('Supabase URL configured', () => {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const hasUrl = envContent.includes('SUPABASE_URL=');
    const isConfigured = !envContent.includes('SUPABASE_URL=https://your-project-ref.supabase.co');
    
    if (!hasUrl) return 'SUPABASE_URL not found in .env';
    if (!isConfigured) return null; // Warning - not configured yet
    return true;
});

test('Supabase Key configured', () => {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const hasKey = envContent.includes('SUPABASE_ANON_KEY=');
    const isConfigured = !envContent.includes('SUPABASE_ANON_KEY=your-anon-key-here');
    
    if (!hasKey) return 'SUPABASE_ANON_KEY not found in .env';
    if (!isConfigured) return null; // Warning - not configured yet
    return true;
});

test('Razorpay Key ID configured', () => {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const hasKey = envContent.includes('RAZORPAY_KEY_ID=');
    const isConfigured = !envContent.includes('RAZORPAY_KEY_ID=your-razorpay-key-id');
    
    if (!hasKey) return 'RAZORPAY_KEY_ID not found in .env';
    if (!isConfigured) return null; // Warning - not configured yet
    return true;
});

test('Razorpay Secret configured', () => {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const hasSecret = envContent.includes('RAZORPAY_KEY_SECRET=');
    const isConfigured = !envContent.includes('RAZORPAY_KEY_SECRET=your-razorpay-key-secret');
    
    if (!hasSecret) return 'RAZORPAY_KEY_SECRET not found in .env';
    if (!isConfigured) return null; // Warning - not configured yet
    return true;
});

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 Test Summary\n');
console.log(`✅ Passed: ${results.passed.length}`);
console.log(`❌ Failed: ${results.failed.length}`);
console.log(`⚠️  Warnings: ${results.warnings.length}`);
console.log('='.repeat(50) + '\n');

if (results.failed.length === 0 && results.warnings.length === 0) {
    console.log('🎉 All tests passed! Credits system is ready.\n');
    console.log('📋 Next steps:');
    console.log('1. Run database migration in Supabase SQL Editor');
    console.log('2. Test payment: npm run dev');
    console.log('3. Build app: npm run build:prod\n');
    process.exit(0);
} else if (results.failed.length === 0) {
    console.log('⚠️  All files are ready, but configuration is incomplete.\n');
    console.log('📋 Next steps:');
    console.log('1. Configure credentials:');
    console.log('   - Run: node setup-credits.js');
    console.log('   - Or edit .env manually\n');
    console.log('2. Run database migration in Supabase SQL Editor');
    console.log('3. Test payment: npm run dev\n');
    process.exit(0);
} else {
    console.log('❌ Some tests failed. Please fix the issues above.\n');
    process.exit(1);
}
