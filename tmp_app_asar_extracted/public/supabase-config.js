// Supabase Configuration
// Replace these with your actual Supabase credentials
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // e.g., https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Initialize Supabase client with SESSION-ONLY mode
let supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: false, // Don't persist session
        autoRefreshToken: false, // Don't auto-refresh
        detectSessionInUrl: false // Don't detect session in URL
    }
});

console.log('⚠️ SESSION-ONLY MODE: Login required on every visit');

export { supabase };
