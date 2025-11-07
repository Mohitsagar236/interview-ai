// Consolidated serverless function for all activation code operations
// Handles: generate, activate, credits, deactivate
const { createClient } = require('@supabase/supabase-js');
const {
    generateActivationCodeEndpoint,
    activateDesktopEndpoint,
    getCreditsByCodeEndpoint,
    updateCreditsByCodeEndpoint,
    deactivateCodeEndpoint
} = require('./activation-codes');

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

        // Route based on action parameter or path
        const action = req.query.action || req.body?.action;

        switch (action) {
            case 'generate':
                await generateActivationCodeEndpoint(req, res, supabase);
                break;
            
            case 'activate':
                await activateDesktopEndpoint(req, res, supabase);
                break;
            
            case 'get-credits':
                await getCreditsByCodeEndpoint(req, res, supabase);
                break;
            
            case 'update-credits':
                await updateCreditsByCodeEndpoint(req, res, supabase);
                break;
            
            case 'deactivate':
                await deactivateCodeEndpoint(req, res, supabase);
                break;
            
            default:
                res.status(400).json({ 
                    error: 'Invalid action. Use: generate, activate, get-credits, update-credits, or deactivate' 
                });
        }
    } catch (error) {
        console.error('Error in activation API:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
