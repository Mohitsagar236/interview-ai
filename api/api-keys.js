// API Key Management Endpoints
// Handles generation, validation, and management of desktop app API keys

const crypto = require('crypto');

/**
 * Generate a secure random API key
 * Format: ia_<32 random hex characters>
 */
function generateApiKey() {
    const randomBytes = crypto.randomBytes(32);
    const key = 'ia_' + randomBytes.toString('hex');
    return key;
}

/**
 * Hash an API key for secure storage
 * Uses SHA-256 for one-way hashing
 */
function hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Get key prefix for identification (first 12 chars)
 */
function getKeyPrefix(apiKey) {
    return apiKey.substring(0, 12) + '...';
}

/**
 * Generate or retrieve API key for user
 * POST /api/generate-api-key
 * Requires authentication (Supabase session)
 */
async function generateApiKeyEndpoint(req, res, supabase) {
    try {
        // Get user from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized - No auth token provided' });
        }

        const token = authHeader.replace('Bearer ', '');
        
        // Verify the user session
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !user) {
            return res.status(401).json({ error: 'Unauthorized - Invalid token' });
        }

        const userId = user.id;
        const regenerate = req.body.regenerate || false;

        // Check if user already has an active API key
        const { data: existingKeys, error: fetchError } = await supabase
            .from('api_keys')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .limit(1);

        if (fetchError) {
            console.error('Error fetching existing keys:', fetchError);
            return res.status(500).json({ error: 'Database error' });
        }

        // If regenerating, deactivate old key
        if (regenerate && existingKeys && existingKeys.length > 0) {
            const { error: deactivateError } = await supabase
                .from('api_keys')
                .update({ is_active: false })
                .eq('id', existingKeys[0].id);

            if (deactivateError) {
                console.error('Error deactivating old key:', deactivateError);
            }
        }

        // If key exists and not regenerating, return existing key info
        if (!regenerate && existingKeys && existingKeys.length > 0) {
            return res.json({
                success: true,
                message: 'API key already exists',
                keyPrefix: existingKeys[0].key_prefix,
                createdAt: existingKeys[0].created_at,
                lastUsed: existingKeys[0].last_used_at,
                isExisting: true
            });
        }

        // Generate new API key
        const apiKey = generateApiKey();
        const keyHash = hashApiKey(apiKey);
        const keyPrefix = getKeyPrefix(apiKey);

        // Store in database
        const { data: newKey, error: insertError } = await supabase
            .from('api_keys')
            .insert({
                user_id: userId,
                key_hash: keyHash,
                key_prefix: keyPrefix,
                name: 'Desktop App Key',
                is_active: true,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insertError) {
            console.error('Error creating API key:', insertError);
            return res.status(500).json({ error: 'Failed to create API key' });
        }

        // Return the key ONLY ONCE (it won't be shown again)
        res.json({
            success: true,
            message: regenerate ? 'API key regenerated successfully' : 'API key generated successfully',
            apiKey: apiKey, // Full key - shown only once!
            keyPrefix: keyPrefix,
            createdAt: newKey.created_at,
            warning: 'Store this key securely. It will not be shown again.'
        });

    } catch (error) {
        console.error('Error in generateApiKeyEndpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Validate API key middleware
 * Checks if API key is valid and active
 */
async function validateApiKey(req, res, next, supabase) {
    try {
        const apiKey = req.headers['x-api-key'];
        
        if (!apiKey) {
            return res.status(401).json({ error: 'API key required' });
        }

        if (!apiKey.startsWith('ia_')) {
            return res.status(401).json({ error: 'Invalid API key format' });
        }

        // Hash the provided key
        const keyHash = hashApiKey(apiKey);

        // Look up key in database using service role key
        const { data: keyData, error } = await supabase
            .from('api_keys')
            .select('*, user_id')
            .eq('key_hash', keyHash)
            .eq('is_active', true)
            .single();

        if (error || !keyData) {
            return res.status(401).json({ error: 'Invalid or inactive API key' });
        }

        // Check if key is expired
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            return res.status(401).json({ error: 'API key has expired' });
        }

        // Update last_used_at
        await supabase
            .from('api_keys')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', keyData.id);

        // Attach user_id to request for use in handlers
        req.userId = keyData.user_id;
        req.apiKeyId = keyData.id;

        next();

    } catch (error) {
        console.error('Error validating API key:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Get user credits with API key authentication
 * GET /api/get-credits
 * Requires X-API-Key header
 */
async function getCreditsEndpoint(req, res, supabase) {
    try {
        const userId = req.userId; // Set by validateApiKey middleware

        // Fetch user's subscription/credits data
        const { data: subscription, error } = await supabase
            .from('subscriptions')
            .select('credits_total, credits_used, plan_type, status')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
            console.error('Error fetching credits:', error);
            return res.status(500).json({ error: 'Failed to fetch credits' });
        }

        if (!subscription) {
            // No subscription found - user has 0 credits
            return res.json({
                success: true,
                credits: {
                    total: 0,
                    used: 0,
                    remaining: 0,
                    planType: 'free',
                    status: 'none'
                }
            });
        }

        // Calculate remaining credits
        const remaining = (subscription.credits_total || 0) - (subscription.credits_used || 0);

        res.json({
            success: true,
            credits: {
                total: subscription.credits_total || 0,
                used: subscription.credits_used || 0,
                remaining: Math.max(0, remaining),
                planType: subscription.plan_type || 'free',
                status: subscription.status || 'active'
            }
        });

    } catch (error) {
        console.error('Error in getCreditsEndpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Update credits used (deduct credits after session)
 * POST /api/update-credits
 * Requires X-API-Key header
 */
async function updateCreditsEndpoint(req, res, supabase) {
    try {
        const userId = req.userId; // Set by validateApiKey middleware
        const { creditsUsed } = req.body;

        if (typeof creditsUsed !== 'number' || creditsUsed < 0) {
            return res.status(400).json({ error: 'Invalid creditsUsed value' });
        }

        // Update credits in database
        const { data, error } = await supabase
            .from('subscriptions')
            .update({ credits_used: creditsUsed })
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            console.error('Error updating credits:', error);
            return res.status(500).json({ error: 'Failed to update credits' });
        }

        res.json({
            success: true,
            message: 'Credits updated successfully',
            credits: {
                total: data.credits_total || 0,
                used: data.credits_used || 0,
                remaining: (data.credits_total || 0) - (data.credits_used || 0)
            }
        });

    } catch (error) {
        console.error('Error in updateCreditsEndpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    generateApiKey,
    hashApiKey,
    getKeyPrefix,
    generateApiKeyEndpoint,
    validateApiKey,
    getCreditsEndpoint,
    updateCreditsEndpoint
};
