/**
 * Test script to check if credit addition is working
 * Run this to diagnose why credits aren't being added
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

console.log('🔍 Testing Credit Addition Setup\n');
console.log('─'.repeat(60));

// Check environment variables
console.log('1. Environment Variables:');
console.log(`   SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
console.log(`   SUPABASE_SERVICE_KEY: ${supabaseServiceKey ? '✅ Set' : '❌ Missing'}`);
console.log('');

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing required environment variables!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function testCreditAddition() {
    // Test email - replace with your actual test email
    const testEmail = 'test@example.com';
    
    console.log('2. Testing User Lookup:');
    console.log(`   Looking up user: ${testEmail}`);
    
    try {
        const { data: userData, error: userError } = await supabase.auth.admin.getUserByEmail(testEmail);
        
        if (userError) {
            console.log(`   ⚠️ User not found: ${userError.message}`);
            console.log('   This is expected if user hasn\'t signed up yet.');
        } else if (userData && userData.user) {
            console.log(`   ✅ User found: ${userData.user.id}`);
            console.log(`      Email: ${userData.user.email}`);
            console.log('');
            
            // Test subscription query
            console.log('3. Testing Subscription Query:');
            const { data: sub, error: subError } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', userData.user.id)
                .maybeSingle();
            
            if (subError) {
                console.log(`   ❌ Error querying subscriptions: ${subError.message}`);
                console.log(`      Code: ${subError.code}`);
                console.log(`      Details: ${subError.details}`);
                console.log(`      Hint: ${subError.hint}`);
            } else if (sub) {
                console.log('   ✅ Subscription found:');
                console.log(`      Plan: ${sub.plan_type}`);
                console.log(`      Credits Total: ${sub.credits_total}`);
                console.log(`      Credits Used: ${sub.credits_used}`);
                console.log(`      Status: ${sub.status}`);
            } else {
                console.log('   ℹ️ No subscription found (will create new)');
            }
        }
    } catch (error) {
        console.error('   ❌ Error:', error.message);
    }
    
    console.log('');
    console.log('4. Database Schema Check:');
    console.log('   Checking if subscriptions table has required columns...');
    
    try {
        const { data, error } = await supabase
            .from('subscriptions')
            .select('user_id, user_email, user_name, credits_total, credits_used')
            .limit(1);
        
        if (error) {
            console.log(`   ❌ Error: ${error.message}`);
            if (error.message.includes('user_email') || error.message.includes('user_name')) {
                console.log('');
                console.log('   ⚠️ IMPORTANT: You need to run the database migration!');
                console.log('   Run the SQL from: add-guest-user-support.sql');
                console.log('   In Supabase SQL Editor');
            }
        } else {
            console.log('   ✅ Table structure looks good!');
        }
    } catch (error) {
        console.error('   ❌ Error:', error.message);
    }
    
    console.log('');
    console.log('─'.repeat(60));
    console.log('\n✅ Test completed! Check the output above for any issues.\n');
}

testCreditAddition();
