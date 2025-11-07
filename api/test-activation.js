// Diagnostic endpoint to test activation code generation
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const diagnostics = {
            timestamp: new Date().toISOString(),
            environment: {},
            supabase: {},
            database: {},
            auth: {}
        };

        // Check environment variables
        diagnostics.environment.supabaseUrl = !!process.env.SUPABASE_URL;
        diagnostics.environment.supabaseServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
        diagnostics.environment.supabaseServiceKeyAlt = !!process.env.SUPABASE_SERVICE_KEY;

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            diagnostics.error = 'Missing Supabase environment variables';
            diagnostics.environment.urlValue = supabaseUrl ? 'present' : 'missing';
            diagnostics.environment.keyValue = supabaseServiceKey ? 'present' : 'missing';
            return res.status(500).json(diagnostics);
        }

        // Test Supabase connection
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        diagnostics.supabase.initialized = true;

        // Test auth with provided token
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '');
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);
            
            diagnostics.auth.tokenProvided = true;
            diagnostics.auth.tokenValid = !authError && !!user;
            diagnostics.auth.userId = user?.id || null;
            diagnostics.auth.userEmail = user?.email || null;
            diagnostics.auth.error = authError?.message || null;

            if (user) {
                // Test database access - check if activation_codes table exists
                try {
                    const { data, error: tableError } = await supabase
                        .from('activation_codes')
                        .select('count')
                        .limit(1);
                    
                    diagnostics.database.activationCodesTableExists = !tableError;
                    diagnostics.database.tableError = tableError?.message || null;
                } catch (err) {
                    diagnostics.database.error = err.message;
                }

                // Test subscriptions table access
                try {
                    const { data: subData, error: subError } = await supabase
                        .from('subscriptions')
                        .select('plan_type, credits_total, credits_used, status')
                        .eq('user_id', user.id)
                        .limit(1);
                    
                    diagnostics.database.subscriptionsTableExists = !subError;
                    diagnostics.database.subscriptionFound = subData && subData.length > 0;
                    diagnostics.database.subscriptionError = subError?.message || null;
                } catch (err) {
                    diagnostics.database.subscriptionTableError = err.message;
                }

                // Test existing activation codes
                try {
                    const { data: existingCodes, error: fetchError } = await supabase
                        .from('activation_codes')
                        .select('*')
                        .eq('user_id', user.id)
                        .eq('is_active', true)
                        .limit(1);
                    
                    diagnostics.database.existingCodesFound = existingCodes && existingCodes.length > 0;
                    diagnostics.database.existingCodesFetchError = fetchError?.message || null;
                } catch (err) {
                    diagnostics.database.existingCodeError = err.message;
                }
            }
        } else {
            diagnostics.auth.tokenProvided = false;
        }

        res.status(200).json(diagnostics);

    } catch (error) {
        res.status(500).json({
            error: 'Diagnostic test failed',
            message: error.message,
            stack: error.stack
        });
    }
};
