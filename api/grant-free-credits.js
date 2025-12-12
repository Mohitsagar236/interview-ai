// Serverless function for Vercel
// POST /api/grant-free-credits
const { createClient } = require('@supabase/supabase-js');

// Helper function to determine credits based on product type
function getCreditsForProduct(productType) {
    const creditsMap = {
        'credits': 3,
        'basic': 3,
        'plus': 8,
        'advanced': 15
    };
    return creditsMap[productType] || 3;
}

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

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('Missing Supabase environment variables');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        console.log('📥 Received free credits request:', req.body);
        
        const { email, name, phone, productType, couponCode } = req.body;
        const coupon = (couponCode || '').toUpperCase();
        
        // Verify the coupon is valid for free credits
        if (coupon !== 'STUDENT') {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid coupon for free credits' 
            });
        }
        
        // Get credits amount for the product
        // STUDENT coupon gives 1 credit (15 minutes) for trial purposes
        const creditsAmount = coupon === 'STUDENT' ? 1 : getCreditsForProduct(productType);
        
        // Find user by email in Supabase Auth
        const { data: users, error: userError } = await supabase.auth.admin.listUsers();
        
        let userId = null;
        
        if (users && users.users) {
            const matchedUser = users.users.find(u => u.email === email);
            if (matchedUser) {
                userId = matchedUser.id;
            }
        }
        
        // If no user found, return error asking them to sign up first
        if (!userId) {
            console.log('⚠️  User not found. Email:', email);
            return res.status(400).json({ 
                success: false,
                error: 'Please create an account first before purchasing credits. Go to Login/Sign Up page.',
                requiresAuth: true
            });
        }
        
        // Check if user already has a subscription
        let existingSubscription = null;
        if (userId) {
            const { data: subs } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', userId)
                .limit(1);
            
            existingSubscription = subs && subs.length > 0 ? subs[0] : null;
        }
        
        let subscriptionResult;
        
        if (existingSubscription) {
            // Update existing subscription - add credits
            const newCreditsTotal = existingSubscription.credits_total + creditsAmount;
            
            subscriptionResult = await supabase
                .from('subscriptions')
                .update({
                    plan_type: productType,
                    status: 'active',
                    description: `${name} - Free credits via ${couponCode} coupon`,
                    credits_total: newCreditsTotal,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingSubscription.id);
            
            console.log('📝 Updated existing subscription with additional credits');
        } else {
            // Insert new subscription
            subscriptionResult = await supabase
                .from('subscriptions')
                .insert({
                    user_id: userId,
                    plan_type: productType,
                    status: 'active',
                    description: `${name} - Free credits via ${couponCode} coupon`,
                    payment_id: email, // Use email as identifier for guests
                    order_id: `FREE_${couponCode}_${Date.now()}`,
                    amount: 0,
                    currency: 'INR',
                    credits_total: creditsAmount,
                    credits_used: 0,
                    start_date: new Date().toISOString()
                });
            
            console.log('➕ Created new subscription');
        }
        
        if (subscriptionResult.error) {
            console.error('Supabase error:', subscriptionResult.error);
            throw new Error(subscriptionResult.error.message);
        }
        
        console.log('✅ Free credits granted successfully to:', email, '- Credits:', creditsAmount);
        
        // Log activity
        if (userId) {
            await supabase
                .from('activity_log')
                .insert({
                    user_id: userId,
                    action_type: 'free_credits_granted',
                    action_details: `Granted ${creditsAmount} credits via ${couponCode} coupon`,
                    metadata: { productType, email, name, couponCode }
                });
        }
        
        res.json({ 
            success: true,
            message: 'Credits granted successfully',
            credits: creditsAmount
        });
        
    } catch (error) {
        console.error('❌ Error granting free credits:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};
