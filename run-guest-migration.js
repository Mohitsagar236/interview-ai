/**
 * Run this migration in your Supabase SQL Editor
 * This adds support for guest users (users who pay before signing up)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
    console.log('🚀 Running guest user support migration...');
    
    // Read SQL file
    const sqlPath = path.join(__dirname, 'add-guest-user-support.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('\n📄 SQL to execute:');
    console.log('─'.repeat(50));
    console.log(sql);
    console.log('─'.repeat(50));
    
    console.log('\n⚠️  Please run this SQL manually in your Supabase SQL Editor:');
    console.log(`   ${supabaseUrl.replace('//', '//app.')}/project/_/sql`);
    console.log('\n✅ After running the SQL, your database will support guest users!\n');
}

runMigration();
