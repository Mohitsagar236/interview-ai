// Serverless function for Vercel
// GET/POST /api/credits-by-code
const { createClient } = require('@supabase/supabase-js');
const { getCreditsByCodeEndpoint, updateCreditsByCodeEndpoint } = require('./activation-codes');

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('Missing Supabase environment variables');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Route based on method
        if (req.method === 'GET') {
            await getCreditsByCodeEndpoint(req, res, supabase);
        } else if (req.method === 'POST') {
            await updateCreditsByCodeEndpoint(req, res, supabase);
        } else {
            res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('Error in credits-by-code:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
