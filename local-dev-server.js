const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Load environment variables once at startup
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY // Use service key for admin operations
);

// Import API key management functions
const {
    generateApiKeyEndpoint,
    validateApiKey,
    getCreditsEndpoint,
    updateCreditsEndpoint
} = require('./api/api-keys');

// Import activation code management functions
const {
    generateActivationCodeEndpoint,
    activateDesktopEndpoint,
    getCreditsByCodeEndpoint,
    updateCreditsByCodeEndpoint,
    deactivateCodeEndpoint
} = require('./api/activation-codes');

// API Routes - Import from api folder
app.post('/api/create-razorpay-order', async (req, res) => {
    try {
        console.log('📥 Received order request:', req.body);
        
        const Razorpay = require('razorpay');
        
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            throw new Error('Razorpay credentials not configured in .env file');
        }
        
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });

        const { amount, currency, notes } = req.body;
        
        if (!amount || amount <= 0) {
            throw new Error('Invalid amount');
        }

        const options = {
            amount: amount * 100, // Convert to paise
            currency: currency || 'INR',
            receipt: `receipt_${Date.now()}`,
            notes: notes || {}
        };

        console.log('🔄 Creating order with options:', options);
        const order = await razorpay.orders.create(options);
        console.log('✅ Order created successfully:', order.id);
        
        // Return with success flag and proper format that frontend expects
        res.json({
            success: true,
            orderId: order.id,
            keyId: process.env.RAZORPAY_KEY_ID,
            amount: order.amount,
            currency: order.currency,
            ...order
        });
    } catch (error) {
        console.error('❌ Error creating Razorpay order:', error.message);
        console.error('Full error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/verify-razorpay-payment', async (req, res) => {
    try {
        console.log('📥 Received payment verification request');
        
        const crypto = require('crypto');
        
        const { 
            razorpay_order_id, 
            razorpay_payment_id, 
            razorpay_signature,
            email,
            name,
            productType,
            amount
        } = req.body;

        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        const isValid = expectedSignature === razorpay_signature;

        if (isValid) {
            console.log('✅ Payment verified successfully');
            
            // Grant credits after successful payment verification
            try {
                const creditsAmount = getCreditsForProduct(productType);
                
                // Find user
                const { data: allUsers } = await supabase.auth.admin.listUsers();
                
                let userId = null;
                if (allUsers && allUsers.users) {
                    const matchedUser = allUsers.users.find(u => u.email === email);
                    if (matchedUser) {
                        userId = matchedUser.id;
                    }
                }
                
                if (!userId) {
                    console.log('⚠️  Payment successful but user not found:', email);
                    // Payment is verified but we can't grant credits without user account
                    return res.json({ 
                        success: true, 
                        message: 'Payment verified but please sign up to receive credits',
                        requiresAuth: true
                    });
                }
                
                // Check if user already has a subscription
                let existingSubscription = null;
                const { data: subs } = await supabase
                    .from('subscriptions')
                    .select('*')
                    .eq('user_id', userId)
                    .limit(1);
                
                existingSubscription = subs && subs.length > 0 ? subs[0] : null;
                
                if (existingSubscription) {
                    // Update existing subscription - add credits
                    const newCreditsTotal = existingSubscription.credits_total + creditsAmount;
                    
                    await supabase
                        .from('subscriptions')
                        .update({
                            plan_type: productType,
                            status: 'active',
                            description: `${name} - Paid subscription`,
                            payment_id: razorpay_payment_id,
                            order_id: razorpay_order_id,
                            amount: amount / 100,
                            credits_total: newCreditsTotal,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existingSubscription.id);
                } else {
                    // Insert new subscription
                    await supabase
                        .from('subscriptions')
                        .insert({
                            user_id: userId,
                            plan_type: productType,
                            status: 'active',
                            description: `${name} - Paid subscription`,
                            payment_id: razorpay_payment_id,
                            order_id: razorpay_order_id,
                            amount: amount / 100, // Convert from paise
                            currency: 'INR',
                            credits_total: creditsAmount,
                            credits_used: 0,
                            start_date: new Date().toISOString()
                        });
                }
                
                console.log('✅ Credits granted to user:', email);
                
                // Log activity
                if (userId) {
                    await supabase
                        .from('activity_log')
                        .insert({
                            user_id: userId,
                            action_type: 'payment_success',
                            action_details: `Purchased ${productType} plan - ${creditsAmount} credits`,
                            metadata: { 
                                payment_id: razorpay_payment_id, 
                                order_id: razorpay_order_id,
                                amount: amount / 100 
                            }
                        });
                }
            } catch (dbError) {
                console.error('⚠️  Payment verified but failed to grant credits:', dbError);
                // Payment is still successful, just log the error
            }
            
            res.json({ 
                success: true, 
                message: 'Payment verified successfully' 
            });
        } else {
            console.log('❌ Invalid payment signature');
            res.status(400).json({ 
                success: false, 
                error: 'Invalid payment signature' 
            });
        }
    } catch (error) {
        console.error('❌ Error verifying payment:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Grant free credits endpoint (for 100% discount coupons like FREEDOM)
app.post('/api/grant-free-credits', async (req, res) => {
    try {
        console.log('📥 Received free credits request:', req.body);
        
        const { email, name, phone, productType, couponCode } = req.body;
        
        // Verify the coupon is valid for free credits
        const coupon = (couponCode || '').toUpperCase();
        if (coupon !== 'STUDENT') {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid coupon for free credits' 
            });
        }
        
        // Get credits amount for the product
        // STUDENT coupon gives only 1 credit (15 minutes) for trial purposes
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
});

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

// Coupon validation endpoint
app.post('/api/validate-coupon', (req, res) => {
    try {
        const { couponCode } = req.body;
        
        const coupons = {
            'WELCOME10': { discount: 10, type: 'percentage' },
            'SAVE20': { discount: 20, type: 'percentage' },
            'FIRSTBUY': { discount: 15, type: 'percentage' },
            'FLAT100': { discount: 100, type: 'fixed' },
            'FLAT200': { discount: 200, type: 'fixed' },
            'STUDENT': { discount: 100, type: 'percentage', restrictTo: ['credits', 'basic', 'plus', 'advanced'] }
        };
        
        const coupon = coupons[couponCode.toUpperCase()];
        
        if (coupon) {
            res.json({
                valid: true,
                discount: coupon.discount,
                type: coupon.type,
                restrictTo: coupon.restrictTo
            });
        } else {
            res.json({
                valid: false,
                message: 'Invalid coupon code'
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// API KEY MANAGEMENT ENDPOINTS
// ============================================

// Generate or retrieve API key for desktop app
app.post('/api/generate-api-key', async (req, res) => {
    await generateApiKeyEndpoint(req, res, supabase);
});

// Get user credits (requires API key authentication)
app.get('/api/get-credits', async (req, res, next) => {
    await validateApiKey(req, res, next, supabase);
}, async (req, res) => {
    await getCreditsEndpoint(req, res, supabase);
});

// Update credits used (requires API key authentication)
app.post('/api/update-credits', async (req, res, next) => {
    await validateApiKey(req, res, next, supabase);
}, async (req, res) => {
    await updateCreditsEndpoint(req, res, supabase);
});

// Validate API key endpoint (for testing)
app.get('/api/validate-key', async (req, res, next) => {
    await validateApiKey(req, res, next, supabase);
}, (req, res) => {
    res.json({ 
        success: true, 
        message: 'API key is valid',
        userId: req.userId 
    });
});

// ============================================
// ACTIVATION CODE ENDPOINTS (SIMPLIFIED DESKTOP AUTH)
// ============================================

// Consolidated activation API endpoint
app.all('/api/activation', async (req, res) => {
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
});

// Legacy endpoints for backward compatibility (redirects to consolidated endpoint)
app.post('/api/generate-activation-code', async (req, res) => {
    req.query.action = 'generate';
    await generateActivationCodeEndpoint(req, res, supabase);
});

app.post('/api/activate-desktop', async (req, res) => {
    req.query.action = 'activate';
    await activateDesktopEndpoint(req, res, supabase);
});

app.get('/api/get-credits-by-code', async (req, res) => {
    req.query.action = 'get-credits';
    await getCreditsByCodeEndpoint(req, res, supabase);
});

app.post('/api/update-credits-by-code', async (req, res) => {
    req.query.action = 'update-credits';
    await updateCreditsByCodeEndpoint(req, res, supabase);
});

app.post('/api/deactivate-code', async (req, res) => {
    req.query.action = 'deactivate';
    await deactivateCodeEndpoint(req, res, supabase);
});

// ============================================

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n✅ Development server running at http://localhost:${PORT}`);
    console.log(`📁 Serving files from: ${path.join(__dirname, 'public')}`);
    console.log(`🔌 API endpoints available at: http://localhost:${PORT}/api/*\n`);
});
