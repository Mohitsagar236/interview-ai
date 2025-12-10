// Unified API Handler - Combines all endpoints into one serverless function
// This reduces Vercel function count from 14 to 1, staying under the 12 function limit

const { createClient } = require('@supabase/supabase-js');

// Import endpoint modules from _lib folder
const activationCodes = require('./_lib/activation-codes');

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
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('[Unified API] Missing Supabase environment variables');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Parse the endpoint from URL path
        const path = req.url.split('?')[0];
        const endpoint = path.replace('/api/', '').replace(/^\//, '');
        
        console.log('[Unified API] Request:', req.method, endpoint);

        // Route to appropriate handler based on endpoint
        switch (endpoint) {
            // Activation code endpoints
            case 'generate-activation-code':
                return await activationCodes.generateActivationCodeEndpoint(req, res, supabase);
            
            case 'activate-desktop':
                return await activationCodes.activateDesktopEndpoint(req, res, supabase);
            
            case 'get-credits-by-code':
                return await activationCodes.getCreditsByCodeEndpoint(req, res, supabase);
            
            case 'update-credits-by-code':
                return await activationCodes.updateCreditsByCodeEndpoint(req, res, supabase);
            
            case 'deactivate-code':
                return await activationCodes.deactivateCodeEndpoint(req, res, supabase);
            
            case 'activation':
                // Handle action-based routing for activation
                const action = req.query.action || req.body?.action;
                switch (action) {
                    case 'sync-subscription':
                        return await activationCodes.syncSubscriptionFromActivationCode(req, res, supabase);
                    case 'generate':
                        return await activationCodes.generateActivationCodeEndpoint(req, res, supabase);
                    default:
                        return res.status(400).json({ error: 'Invalid action parameter' });
                }
            
            default:
                return res.status(404).json({ error: 'Endpoint not found' });
        }

    } catch (error) {
        console.error('[Unified API] Error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
};
