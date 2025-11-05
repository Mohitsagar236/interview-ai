/**
 * Credits System Setup Script
 * Run this to set up the credits system
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const envPath = path.join(__dirname, '.env');

console.log('\n🚀 Credits System Setup\n');
console.log('This script will help you configure the credits system.\n');

const questions = [
    {
        key: 'SUPABASE_URL',
        prompt: '📦 Enter your Supabase Project URL (e.g., https://xxxxx.supabase.co): ',
        validate: (value) => value.includes('supabase.co'),
        default: 'https://your-project-ref.supabase.co'
    },
    {
        key: 'SUPABASE_ANON_KEY',
        prompt: '🔑 Enter your Supabase Anon Key: ',
        validate: (value) => value.length > 20,
        default: 'your-anon-key-here'
    },
    {
        key: 'SUPABASE_SERVICE_KEY',
        prompt: '🔐 Enter your Supabase Service Role Key (optional, press Enter to skip): ',
        validate: () => true,
        optional: true,
        default: 'your-service-role-key-here'
    },
    {
        key: 'RAZORPAY_KEY_ID',
        prompt: '💳 Enter your Razorpay Key ID: ',
        validate: (value) => value.startsWith('rzp_'),
        default: 'your-razorpay-key-id'
    },
    {
        key: 'RAZORPAY_KEY_SECRET',
        prompt: '🔒 Enter your Razorpay Key Secret: ',
        validate: (value) => value.length > 10,
        default: 'your-razorpay-key-secret'
    }
];

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function updateEnv(key, value) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    const regex = new RegExp(`${key}=.*`, 'g');
    if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
        envContent += `\n${key}=${value}`;
    }
    
    fs.writeFileSync(envPath, envContent);
}

async function setup() {
    console.log('Please provide the following credentials:\n');
    
    const answers = {};
    
    for (const q of questions) {
        let value = '';
        let isValid = false;
        
        while (!isValid) {
            value = await question(q.prompt);
            
            // If optional and empty, use default
            if (q.optional && !value.trim()) {
                value = q.default;
                isValid = true;
                break;
            }
            
            // Skip if user doesn't want to change
            if (value.trim().toLowerCase() === 'skip') {
                console.log(`⏭️  Skipping ${q.key}\n`);
                continue;
            }
            
            if (q.validate(value)) {
                isValid = true;
            } else {
                console.log('❌ Invalid input. Please try again.\n');
            }
        }
        
        answers[q.key] = value;
        console.log(`✅ ${q.key} configured\n`);
    }
    
    console.log('\n📝 Updating .env file...');
    
    for (const [key, value] of Object.entries(answers)) {
        await updateEnv(key, value);
    }
    
    console.log('✅ .env file updated successfully!\n');
    
    console.log('📋 Next steps:\n');
    console.log('1. Run the database migration in Supabase SQL Editor');
    console.log('   - Copy contents from: credits-migration.sql');
    console.log('   - Paste and run in Supabase dashboard\n');
    console.log('2. Test the payment flow:');
    console.log('   - npm run dev');
    console.log('   - Visit: http://localhost:3000/payment.html?product=basic\n');
    console.log('3. Build and test desktop app:');
    console.log('   - npm run build:prod');
    console.log('   - Test credit tracking in app\n');
    console.log('📚 Full documentation: CREDITS_SYSTEM_README.md\n');
    
    rl.close();
}

// Check if user wants to skip interactive mode
const args = process.argv.slice(2);
if (args.includes('--skip') || args.includes('-s')) {
    console.log('⏭️  Skipping interactive setup. Please edit .env manually.\n');
    console.log('📋 Required environment variables:');
    console.log('  - SUPABASE_URL');
    console.log('  - SUPABASE_ANON_KEY');
    console.log('  - SUPABASE_SERVICE_KEY (optional)');
    console.log('  - RAZORPAY_KEY_ID');
    console.log('  - RAZORPAY_KEY_SECRET\n');
    process.exit(0);
} else if (args.includes('--help') || args.includes('-h')) {
    console.log('Credits System Setup Script\n');
    console.log('Usage:');
    console.log('  node setup-credits.js          - Interactive setup');
    console.log('  node setup-credits.js --skip   - Skip interactive mode');
    console.log('  node setup-credits.js --help   - Show this help\n');
    process.exit(0);
}

setup().catch((error) => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
});
