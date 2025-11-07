// Activation Code Management Endpoints
// Simple code-based authentication for desktop app
// Replaces complex API key login with easy-to-use activation codes

const crypto = require('crypto');

/**
 * Generate a secure random activation code
 * Format: XXXX-XXXX-XXXX-XXXX (16 characters, easy to type)
 */
function generateActivationCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Remove confusing chars (0,O,1,I)
    let code = '';
    
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) {
            code += '-';
        }
        const randomIndex = crypto.randomInt(0, chars.length);
        code += chars[randomIndex];
    }
    
    return code;
}

/**
 * Generate or retrieve activation code for user
 * POST /api/generate-activation-code
 * Requires authentication (Supabase session)
 */
async function generateActivationCodeEndpoint(req, res, supabase) {
    try {
        console.log('[Generate Activation] Starting endpoint execution');
        
        // Get user from Authorization header
        const authHeader = req.headers.authorization;
        console.log('[Generate Activation] Auth header present:', !!authHeader);
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.error('[Generate Activation] No auth token provided');
            return res.status(401).json({ error: 'Unauthorized - No auth token provided' });
        }

        const token = authHeader.replace('Bearer ', '');
        console.log('[Generate Activation] Token extracted, length:', token.length);
        
        // Verify the user session
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        console.log('[Generate Activation] Auth verification - User:', !!user, 'Error:', !!authError);
        
        if (authError || !user) {
            console.error('[Generate Activation] Auth error:', authError);
            return res.status(401).json({ error: 'Unauthorized - Invalid token' });
        }

        const userId = user.id;
        const regenerate = req.body.regenerate || false;
        
        console.log('[Generate Activation] User ID:', userId, 'Regenerate:', regenerate);

        // Get user's subscription data to include in code
        console.log('[Generate Activation] Fetching subscription data...');
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select('plan_type, credits_total, credits_used, status')
            .eq('user_id', userId)
            .single();

        if (subError && subError.code !== 'PGRST116') { // PGRST116 = no rows
            console.error('[Generate Activation] Error fetching subscription:', subError);
        } else {
            console.log('[Generate Activation] Subscription data fetched successfully');
        }

        const planType = subscription?.plan_type || 'free';
        const creditsTotal = subscription?.credits_total || 0;
        const creditsUsed = subscription?.credits_used || 0;
        const planStatus = subscription?.status || 'active';

        console.log('[Generate Activation] Plan:', planType, 'Credits:', creditsTotal, '/', creditsUsed);

        // Check if user already has an active activation code
        console.log('[Generate Activation] Checking for existing codes...');
        const { data: existingCodes, error: fetchError } = await supabase
            .from('activation_codes')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .limit(1);

        if (fetchError) {
            console.error('[Generate Activation] Error fetching existing codes:', fetchError);
            return res.status(500).json({ error: 'Database error', details: fetchError.message });
        }

        console.log('[Generate Activation] Existing codes found:', existingCodes?.length || 0);

        // If regenerating, deactivate old code
        const existingCode = existingCodes && existingCodes.length > 0 ? existingCodes[0] : null;

        // Regenerate by updating the existing active code in place (retry on code collisions)
        if (regenerate && existingCode) {
            let attempts = 0;
            while (attempts < 5) {
                const activationCode = generateActivationCode();
                const timestamp = new Date().toISOString();

                const { data: updatedCode, error: updateError } = await supabase
                    .from('activation_codes')
                    .update({
                        code: activationCode,
                        credits_total: creditsTotal,
                        credits_used: creditsUsed,
                        plan_type: planType,
                        user_email: user.email,
                        user_name: user.user_metadata?.name || user.email,
                        is_active: true,
                        updated_at: timestamp
                    })
                    .eq('id', existingCode.id)
                    .select()
                    .single();

                if (!updateError && updatedCode) {
                    return res.json({
                        success: true,
                        message: 'Activation code regenerated successfully',
                        code: updatedCode.code,
                        creditsTotal: updatedCode.credits_total,
                        creditsUsed: updatedCode.credits_used,
                        creditsRemaining: updatedCode.credits_total - updatedCode.credits_used,
                        planType: updatedCode.plan_type,
                        createdAt: updatedCode.created_at,
                        lastUsed: updatedCode.last_used_at
                    });
                }

                // Retry on unique constraint (duplicate code) collisions
                if (updateError?.code === '23505') {
                    attempts += 1;
                    continue;
                }

                console.error('Error regenerating activation code:', updateError);
                return res.status(500).json({
                    error: 'Failed to regenerate activation code',
                    details: updateError?.message,
                    hint: updateError?.hint,
                    code: updateError?.code
                });
            }

            return res.status(500).json({
                error: 'Failed to regenerate activation code',
                details: 'Exceeded retry attempts while generating a unique code.'
            });
        }

        // If code exists and not regenerating, return existing code
        if (existingCode && !regenerate) {
            let codeRecord = existingCode;

            // Keep activation record in sync with the latest subscription snapshot
            const needsSync =
                codeRecord.credits_total !== creditsTotal ||
                codeRecord.credits_used !== creditsUsed ||
                codeRecord.plan_type !== planType;

            if (needsSync) {
                const { data: syncedCode, error: syncError } = await supabase
                    .from('activation_codes')
                    .update({
                        credits_total: creditsTotal,
                        credits_used: creditsUsed,
                        plan_type: planType,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', codeRecord.id)
                    .select()
                    .single();

                if (!syncError && syncedCode) {
                    codeRecord = syncedCode;
                } else if (syncError) {
                    console.error('Error syncing activation code snapshot:', syncError);
                }
            }

            return res.json({
                success: true,
                message: 'Activation code already exists',
                code: codeRecord.code,
                creditsTotal: codeRecord.credits_total,
                creditsUsed: codeRecord.credits_used,
                planType: codeRecord.plan_type,
                createdAt: codeRecord.created_at,
                lastUsed: codeRecord.last_used_at,
                isExisting: true
            });
        }

        // Generate new activation code for first-time users (retry on code collisions)
        let attempts = 0;
        while (attempts < 5) {
            const activationCode = generateActivationCode();

            const { data: newCode, error: insertError } = await supabase
                .from('activation_codes')
                .insert({
                    user_id: userId,
                    code: activationCode,
                    credits_total: creditsTotal,
                    credits_used: creditsUsed,
                    plan_type: planType,
                    user_email: user.email,
                    user_name: user.user_metadata?.name || user.email,
                    is_active: true,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (!insertError && newCode) {
                return res.json({
                    success: true,
                    message: 'Activation code generated successfully',
                    code: activationCode,
                    creditsTotal: creditsTotal,
                    creditsUsed: creditsUsed,
                    creditsRemaining: creditsTotal - creditsUsed,
                    planType: planType,
                    createdAt: newCode.created_at,
                    instructions: 'Enter this code in your desktop app to activate it and sync your credits.'
                });
            }

            if (insertError?.code === '23505') {
                attempts += 1;
                continue;
            }

            console.error('Error creating activation code:', insertError);
            console.error('Error details:', JSON.stringify(insertError, null, 2));
            return res.status(500).json({ 
                error: 'Failed to create activation code',
                details: insertError?.message,
                hint: insertError?.hint,
                code: insertError?.code
            });
        }

        return res.status(500).json({
            error: 'Failed to create activation code',
            details: 'Exceeded retry attempts while generating a unique code.'
        });

    } catch (error) {
        console.error('[Generate Activation] Unhandled error in generateActivationCodeEndpoint:', error);
        console.error('[Generate Activation] Error stack:', error.stack);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}

/**
 * Validate and activate desktop app with code
 * POST /api/activate-desktop
 * Body: { code: 'XXXX-XXXX-XXXX-XXXX', deviceInfo: {...} }
 */
async function activateDesktopEndpoint(req, res, supabase) {
    try {
        const { code, deviceInfo } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'Activation code required' });
        }

        // Normalize code (remove spaces, convert to uppercase)
        const normalizedCode = code.replace(/\s+/g, '').toUpperCase();

        // Look up code in database
        const { data: codeData, error } = await supabase
            .from('activation_codes')
            .select('*')
            .eq('code', normalizedCode)
            .eq('is_active', true)
            .single();

        if (error || !codeData) {
            return res.status(401).json({ 
                error: 'Invalid or inactive activation code',
                details: 'Please check the code and try again, or generate a new one from your profile.'
            });
        }

        // Check if code is expired
        if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
            return res.status(401).json({ 
                error: 'Activation code has expired',
                details: 'Please generate a new code from your profile page.'
            });
        }

        // Update last_used_at and device info
        const updateData = {
            last_used_at: new Date().toISOString()
        };

        if (deviceInfo) {
            updateData.device_info = deviceInfo;
        }

        await supabase
            .from('activation_codes')
            .update(updateData)
            .eq('id', codeData.id);

        // Return user and credit information
        res.json({
            success: true,
            message: 'Desktop app activated successfully',
            user: {
                id: codeData.user_id,
                email: codeData.user_email,
                name: codeData.user_name
            },
            credits: {
                total: codeData.credits_total,
                used: codeData.credits_used,
                remaining: codeData.credits_total - codeData.credits_used
            },
            planType: codeData.plan_type,
            activationCode: normalizedCode // Return for storage in desktop app
        });

    } catch (error) {
        console.error('Error in activateDesktopEndpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Get user credits using activation code
 * GET /api/get-credits-by-code
 * Headers: X-Activation-Code: XXXX-XXXX-XXXX-XXXX
 */
async function getCreditsByCodeEndpoint(req, res, supabase) {
    try {
        const code = req.headers['x-activation-code'];
        
        if (!code) {
            return res.status(401).json({ error: 'Activation code required' });
        }

        // Normalize code
        const normalizedCode = code.replace(/\s+/g, '').toUpperCase();

        // Look up code in database
        const { data: codeData, error } = await supabase
            .from('activation_codes')
            .select('*')
            .eq('code', normalizedCode)
            .eq('is_active', true)
            .single();

        if (error || !codeData) {
            return res.status(401).json({ error: 'Invalid or inactive activation code' });
        }

        // Check if code is expired
        if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
            return res.status(401).json({ error: 'Activation code has expired' });
        }

        // Get latest subscription data
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('credits_total, credits_used, plan_type, status')
            .eq('user_id', codeData.user_id)
            .single();

        const creditsTotal = subscription?.credits_total || codeData.credits_total;
        const creditsUsed = subscription?.credits_used || codeData.credits_used;

        // Update last_used_at
        await supabase
            .from('activation_codes')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', codeData.id);

        res.json({
            success: true,
            credits: {
                total: creditsTotal,
                used: creditsUsed,
                remaining: creditsTotal - creditsUsed
            },
            planType: subscription?.plan_type || codeData.plan_type,
            user: {
                email: codeData.user_email,
                name: codeData.user_name
            }
        });

    } catch (error) {
        console.error('Error in getCreditsByCodeEndpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Update credits used via activation code
 * POST /api/update-credits-by-code
 * Headers: X-Activation-Code: XXXX-XXXX-XXXX-XXXX
 * Body: { creditsUsed: number }
 */
async function updateCreditsByCodeEndpoint(req, res, supabase) {
    try {
        const code = req.headers['x-activation-code'];
        const { creditsUsed } = req.body;
        
        if (!code) {
            return res.status(401).json({ error: 'Activation code required' });
        }

        if (typeof creditsUsed !== 'number' || creditsUsed < 0) {
            return res.status(400).json({ error: 'Invalid creditsUsed value' });
        }

        // Normalize code
        const normalizedCode = code.replace(/\s+/g, '').toUpperCase();

        // Look up code in database
        const { data: codeData, error } = await supabase
            .from('activation_codes')
            .select('*')
            .eq('code', normalizedCode)
            .eq('is_active', true)
            .single();

        if (error || !codeData) {
            return res.status(401).json({ error: 'Invalid or inactive activation code' });
        }

        // Update subscription credits
        const { error: updateError } = await supabase
            .from('subscriptions')
            .update({ 
                credits_used: creditsUsed,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', codeData.user_id);

        if (updateError) {
            console.error('Error updating credits:', updateError);
            return res.status(500).json({ error: 'Failed to update credits' });
        }

        // Update activation code record
        await supabase
            .from('activation_codes')
            .update({ 
                credits_used: creditsUsed,
                last_used_at: new Date().toISOString()
            })
            .eq('id', codeData.id);

        // Get updated data
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('credits_total, credits_used')
            .eq('user_id', codeData.user_id)
            .single();

        res.json({
            success: true,
            message: 'Credits updated successfully',
            credits: {
                total: subscription?.credits_total || codeData.credits_total,
                used: creditsUsed,
                remaining: (subscription?.credits_total || codeData.credits_total) - creditsUsed
            }
        });

    } catch (error) {
        console.error('Error in updateCreditsByCodeEndpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Deactivate activation code (for security)
 * POST /api/deactivate-code
 * Requires authentication (Supabase session)
 */
async function deactivateCodeEndpoint(req, res, supabase) {
    try {
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

        // Deactivate all codes for user
        const { error: updateError } = await supabase
            .from('activation_codes')
            .update({ is_active: false })
            .eq('user_id', user.id)
            .eq('is_active', true);

        if (updateError) {
            console.error('Error deactivating codes:', updateError);
            return res.status(500).json({ error: 'Failed to deactivate codes' });
        }

        res.json({
            success: true,
            message: 'All activation codes deactivated'
        });

    } catch (error) {
        console.error('Error in deactivateCodeEndpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    generateActivationCode,
    generateActivationCodeEndpoint,
    activateDesktopEndpoint,
    getCreditsByCodeEndpoint,
    updateCreditsByCodeEndpoint,
    deactivateCodeEndpoint
};
