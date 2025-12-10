// Consolidated serverless function for all activation code operations
// Handles: generate, activate, credits, deactivate, sync-subscription
const { createClient } = require('@supabase/supabase-js');
const {
    generateActivationCodeEndpoint,
    activateDesktopEndpoint,
    getCreditsByCodeEndpoint,
    updateCreditsByCodeEndpoint,
    deactivateCodeEndpoint,
    syncSubscriptionFromActivationCode
} = require('./_lib/activation-codes');

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
            console.error('[Activation API] Missing Supabase environment variables');
            console.error('[Activation API] SUPABASE_URL present:', !!supabaseUrl);
            console.error('[Activation API] SUPABASE_SERVICE_ROLE_KEY present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
            console.error('[Activation API] SUPABASE_SERVICE_KEY present:', !!process.env.SUPABASE_SERVICE_KEY);
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Route based on action parameter or path
        const action = req.query.action || req.body?.action;
        console.log('[Activation API] Received request - Method:', req.method, 'Action:', action);

        switch (action) {
            case 'generate':
                console.log('[Activation API] Routing to generateActivationCodeEndpoint');
                await generateActivationCodeEndpoint(req, res, supabase);
                break;
            
            case 'activate':
                console.log('[Activation API] Routing to activateDesktopEndpoint');
                await activateDesktopEndpoint(req, res, supabase);
                break;
            
            case 'get-credits':
                console.log('[Activation API] Routing to getCreditsByCodeEndpoint');
                await getCreditsByCodeEndpoint(req, res, supabase);
                break;
            
            case 'update-credits':
                console.log('[Activation API] Routing to updateCreditsByCodeEndpoint');
                await updateCreditsByCodeEndpoint(req, res, supabase);
                break;
            
            case 'deactivate':
                console.log('[Activation API] Routing to deactivateCodeEndpoint');
                await deactivateCodeEndpoint(req, res, supabase);
                break;
            
            case 'sync-subscription':
                console.log('[Activation API] Routing to syncSubscription');
                await syncSubscriptionFromActivationCode(req, res, supabase);
                break;
            
            default:
                console.error('[Activation API] Invalid action received:', action);
                res.status(400).json({ 
                    error: 'Invalid action. Use: generate, activate, get-credits, update-credits, or deactivate' 
                });
        }
    } catch (error) {
        console.error('[Activation API] Unhandled error:', error);
        console.error('[Activation API] Error stack:', error.stack);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
