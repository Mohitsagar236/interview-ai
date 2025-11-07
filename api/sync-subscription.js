// Sync subscription data from activation code
// This endpoint creates/updates subscription record based on activation code data
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Get user from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = user.id;

        // Get activation code data for this user
        const { data: activationCode, error: codeError } = await supabase
            .from('activation_codes')
            .select('plan_type, credits_total, credits_used')
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        if (codeError || !activationCode) {
            return res.status(404).json({ 
                error: 'No active activation code found',
                details: 'Please generate an activation code first'
            });
        }

        // Create or update subscription from activation code data
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .upsert({
                user_id: userId,
                plan_type: activationCode.plan_type || 'free',
                credits_total: activationCode.credits_total || 0,
                credits_used: activationCode.credits_used || 0,
                status: 'active',
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            })
            .select()
            .single();

        if (subError) {
            console.error('Error syncing subscription:', subError);
            return res.status(500).json({ 
                error: 'Failed to sync subscription',
                details: subError.message
            });
        }

        res.json({
            success: true,
            message: 'Subscription synced successfully',
            subscription: subscription
        });

    } catch (error) {
        console.error('Error in sync-subscription:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
