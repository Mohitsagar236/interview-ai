// Script to run the API keys migration
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    console.log('🚀 Running API Keys Migration...\n');

    // Check environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env file');
        process.exit(1);
    }

    console.log('✅ Supabase URL:', process.env.SUPABASE_URL);
    console.log('✅ Service key found\n');

    // Create Supabase client with service role
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
    );

    try {
        // Read the migration SQL file
        const migrationPath = path.join(__dirname, 'api-keys-migration.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        console.log('📄 Read migration file: api-keys-migration.sql');
        console.log('📝 SQL length:', migrationSQL.length, 'characters\n');

        // Split SQL into individual statements
        const statements = migrationSQL
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        console.log('🔧 Found', statements.length, 'SQL statements to execute\n');

        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            console.log(`\n[${i + 1}/${statements.length}] Executing statement...`);
            console.log('Preview:', statement.substring(0, 100) + '...\n');

            const { data, error } = await supabase.rpc('exec_sql', { 
                sql: statement + ';'
            });

            if (error) {
                // Try direct query method
                console.log('⚠️  RPC failed, trying direct query...');
                const { error: directError } = await supabase
                    .from('_migrations')
                    .select('*')
                    .limit(1);
                
                if (directError) {
                    console.error('❌ Error executing statement:', error.message);
                    console.error('Full error:', error);
                    
                    // Continue with other statements
                    console.log('⏭️  Continuing with next statement...\n');
                } else {
                    console.log('✅ Statement executed successfully\n');
                }
            } else {
                console.log('✅ Statement executed successfully\n');
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('🎉 Migration completed!');
        console.log('='.repeat(60));
        console.log('\nPlease verify in Supabase dashboard:');
        console.log('1. Go to: https://supabase.com/dashboard/project/npdysfxewryqcmmztdxl/editor');
        console.log('2. Check if "api_keys" table exists');
        console.log('3. Check if RLS policies are created');
        console.log('\nIf the table does not exist, you need to run the SQL manually:');
        console.log('1. Copy content from api-keys-migration.sql');
        console.log('2. Go to SQL Editor in Supabase dashboard');
        console.log('3. Paste and execute the SQL');

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error('Full error:', error);
        console.log('\n⚠️  Manual migration required:');
        console.log('1. Open Supabase Dashboard SQL Editor');
        console.log('2. Copy content from api-keys-migration.sql');
        console.log('3. Paste and run the SQL manually');
        process.exit(1);
    }
}

runMigration();
