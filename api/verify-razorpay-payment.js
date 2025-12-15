/**
 * Razorpay Payment Verification API
 * Verifies payment signature and processes the order
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with SERVICE KEY for admin operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use service key for admin.getUserByEmail()
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    },
    db: {
        schema: 'public'
    }
}) : null;

// Credit mapping for each plan
const PLAN_CREDITS = {
    basic: 3,        // Basic plan: 3 credits (3 hours)
    plus: 8,         // Plus plan: 6 + 2 free = 8 credits (8 hours)
    advanced: 15,    // Advanced plan: 9 + 6 free = 15 credits (15 hours)
    credits: 3,      // Generic credits: 3 credits (default)
    windows: 3,      // Windows app purchase: 3 credits
    mac: 3           // Mac app purchase: 3 credits
};

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { 
            razorpay_order_id, 
            razorpay_payment_id, 
            razorpay_signature,
            email,
            name,
            productType 
        } = req.body;

        // Validate input
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing payment verification data' 
            });
        }

        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        const isAuthentic = expectedSignature === razorpay_signature;

        if (!isAuthentic) {
            return res.status(400).json({
                success: false,
                error: 'Payment verification failed',
                message: 'Invalid signature'
            });
        }

        // Payment is verified successfully
        console.log('Payment verified successfully:', {
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            email,
            productType
        });

        // Add credits to user's account if Supabase is configured and product type is a credit plan
        // Accept: basic, plus, advanced, credits, windows, mac
        const creditPlans = ['basic', 'plus', 'advanced', 'credits', 'windows', 'mac'];
        let creditsAdded = false;
        let creditAdditionDetails = '';
        
        if (supabase && creditPlans.includes(productType)) {
            try {
                const creditsToAdd = PLAN_CREDITS[productType] || PLAN_CREDITS.basic || 3;
                console.log(`💳 Adding ${creditsToAdd} credits for ${productType} plan to user: ${email}`);
                
                // Find user by email using direct API call (admin method may not be available in all versions)
                let userData = null;
                let userError = null;
                
                try {
                    // Try to use admin API if available
                    if (supabase.auth.admin && typeof supabase.auth.admin.getUserByEmail === 'function') {
                        const result = await supabase.auth.admin.getUserByEmail(email);
                        userData = result.data;
                        userError = result.error;
                    } else {
                        // Fallback: Query auth.users directly using service key
                        const { data, error } = await supabase
                            .from('users')
                            .select('*')
                            .eq('email', email)
                            .single();
                        
                        if (!error && data) {
                            userData = { user: data };
                        } else {
                            userError = error;
                        }
                    }
                } catch (adminError) {
                    console.error('Admin API error:', adminError);
                    userError = adminError;
                }
                
                if (userError || !userData || !userData.user) {
                    console.warn('⚠️ User not found in Supabase, creating guest subscription record');
                    
                    // Create a guest subscription record using email as identifier
                    const { data: guestSub, error: guestError } = await supabase
                        .from('subscriptions')
                        .insert({
                            user_email: email,
                            user_name: name,
                            plan_type: productType,
                            status: 'active',
                            credits_total: creditsToAdd,
                            credits_used: 0,
                            payment_id: razorpay_payment_id,
                            order_id: razorpay_order_id,
                            amount: req.body.amount || PLAN_CREDITS[productType] * 100,
                            description: `${productType.charAt(0).toUpperCase() + productType.slice(1)} Plan - ${creditsToAdd} credits`
                        })
                        .select()
                        .single();
                    
                    if (guestError) {
                        console.error('❌ Error creating guest subscription:', guestError);
                        console.error('Guest error details:', JSON.stringify(guestError, null, 2));
                        creditAdditionDetails = `Guest user failed: ${guestError.message}`;
                    } else {
                        console.log(`✅ Created guest subscription with ${creditsToAdd} credits for ${email}`);
                        creditsAdded = true;
                        creditAdditionDetails = `Guest user created: ${creditsToAdd} credits`;
                    }
                } else if (userData && userData.user) {
                    const userId = userData.user.id;
                    
                    // Check if subscription exists (bypass RLS with service key)
                    const { data: existingSub, error: fetchError } = await supabase
                        .from('subscriptions')
                        .select('*')
                        .eq('user_id', userId)
                        .maybeSingle();
                    
                    if (fetchError) {
                        console.error('❌ Error fetching subscription:', fetchError);
                    }
                    
                    if (existingSub) {
                        // Update existing subscription - add credits
                        const { error: updateError } = await supabase
                            .from('subscriptions')
                            .update({
                                plan_type: productType,
                                status: 'active',
                                credits_total: (existingSub.credits_total || 0) + creditsToAdd,
                                payment_id: razorpay_payment_id,
                                order_id: razorpay_order_id,
                                amount: PLAN_CREDITS[productType] * 100, // Example amount
                                updated_at: new Date().toISOString()
                            })
                            .eq('user_id', userId);
                        
                        if (updateError) {
                            console.error('❌ Error updating subscription credits:', updateError);
                            console.error('Update error details:', JSON.stringify(updateError, null, 2));
                            creditAdditionDetails = `Failed to update: ${updateError.message}`;
                        } else {
                            console.log(`✅ Successfully added ${creditsToAdd} credits to user ${email}`);
                            console.log(`📊 Total credits now: ${(existingSub.credits_total || 0) + creditsToAdd}`);
                            creditsAdded = true;
                            creditAdditionDetails = `Updated: +${creditsToAdd} credits (total: ${(existingSub.credits_total || 0) + creditsToAdd})`;
                        }
                    } else {
                        // Create new subscription
                        console.log(`📝 Creating new subscription for user ${email}`);
                        const { error: insertError } = await supabase
                            .from('subscriptions')
                            .insert({
                                user_id: userId,
                                plan_type: productType,
                                status: 'active',
                                credits_total: creditsToAdd,
                                credits_used: 0,
                                payment_id: razorpay_payment_id,
                                order_id: razorpay_order_id,
                                amount: PLAN_CREDITS[productType] * 100,
                                description: `${productType.charAt(0).toUpperCase() + productType.slice(1)} Plan - ${creditsToAdd} credits`
                            });
                        
                        if (insertError) {
                            console.error('❌ Error creating subscription with credits:', insertError);
                            console.error('Insert error details:', JSON.stringify(insertError, null, 2));
                            creditAdditionDetails = `Failed to create: ${insertError.message}`;
                        } else {
                            console.log(`✅ Successfully created subscription with ${creditsToAdd} credits for user ${email}`);
                            creditsAdded = true;
                            creditAdditionDetails = `Created: ${creditsToAdd} credits`;
                        }
                    }
                }
            } catch (creditsError) {
                console.error('Error adding credits:', creditsError);
                // Don't fail the payment, just log the error
            }
        }

        // Get download URL based on product type - use R2 direct URLs or API endpoint
        const R2_BASE_URL = process.env.R2_PUBLIC_URL || 'https://pub-bd0f8fce43ae498088abfcbd6d669f15.r2.dev';
        const downloadUrls = {
            basic: `${R2_BASE_URL}/releases/v0.1.0/Interview-AI-Setup-0.1.0-x64.exe`,
            plus: `${R2_BASE_URL}/releases/v0.1.0/Interview-AI-Setup-0.1.0-x64.exe`,
            advanced: `${R2_BASE_URL}/releases/v0.1.0/Interview-AI-Setup-0.1.0-x64.exe`,
            windows: `${R2_BASE_URL}/releases/v0.1.0/Interview-AI-Setup-0.1.0-x64.exe`,
            mac: `${R2_BASE_URL}/releases/v0.1.0/Interview-AI-0.1.0.dmg`
        };

        const downloadUrl = downloadUrls[productType] || downloadUrls.windows;

        // Send success email with download link
        await sendSuccessEmail({
            email,
            name,
            productType,
            paymentId: razorpay_payment_id,
            downloadUrl
        });

        return res.status(200).json({
            success: true,
            message: 'Payment verified successfully',
            downloadUrl: downloadUrl,
            paymentId: razorpay_payment_id,
            creditsAdded: creditsAdded,
            creditDetails: creditAdditionDetails || 'No credits to add for this product'
        });

    } catch (error) {
        console.error('Error verifying payment:', error);
        return res.status(500).json({
            success: false,
            error: 'Payment verification failed',
            message: error.message
        });
    }
};

/**
 * Send success email with download link
 */
async function sendSuccessEmail({ email, name, productType, paymentId, downloadUrl }) {
    try {
        const emailContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .features { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .feature { padding: 10px 0; }
        .check { color: #10b981; margin-right: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Payment Successful!</h1>
            <p>Your Interview AI Assistant is ready to download</p>
        </div>
        <div class="content">
            <p>Hi ${name || 'there'},</p>
            <p>Thank you for your purchase! Your payment has been confirmed and processed successfully.</p>
            
            <h3>📦 Order Details:</h3>
            <ul>
                <li><strong>Product:</strong> Interview AI - ${productType}</li>
                <li><strong>Payment ID:</strong> ${paymentId}</li>
                <li><strong>Status:</strong> ✅ Confirmed</li>
            </ul>

            <p style="text-align: center;">
                <a href="${downloadUrl}" class="button">⬇️ Download Now</a>
            </p>

            <div class="features">
                <h3>✨ What's Included:</h3>
                <div class="feature"><span class="check">✓</span> 100% Private & Undetectable</div>
                <div class="feature"><span class="check">✓</span> Real-time AI transcription</div>
                <div class="feature"><span class="check">✓</span> Smart answer suggestions</div>
                <div class="feature"><span class="check">✓</span> Screen capture OCR</div>
                <div class="feature"><span class="check">✓</span> Unlimited interviews</div>
                <div class="feature"><span class="check">✓</span> Free updates for 1 year</div>
                <div class="feature"><span class="check">✓</span> Priority support</div>
            </div>

            <h3>🚀 Getting Started:</h3>
            <ol>
                <li>Click the "Download Now" button above</li>
                <li>Install the application on your computer</li>
                <li>Launch Interview AI Assistant</li>
                <li>Start your first interview with confidence!</li>
            </ol>

            <p><strong>Need Help?</strong> We're here for you!</p>
            <p>📧 Email: support@interview-ai.app<br>
            💬 Visit our help center for guides and tutorials</p>

            <p style="margin-top: 30px; padding: 15px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
                <strong>⚡ Pro Tip:</strong> Keep this email safe! You can use the download link anytime to reinstall the software.
            </p>
        </div>
        <div class="footer">
            <p>© 2025 Interview AI. All rights reserved.</p>
            <p>This is an automated email. Please do not reply to this message.</p>
        </div>
    </div>
</body>
</html>
        `;

        console.log('Success email would be sent to:', email);
        
        // Integrate with your email service here
        if (process.env.EMAIL_SERVICE_URL) {
            await fetch(process.env.EMAIL_SERVICE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: email,
                    subject: '✅ Your Interview AI Download Link - Payment Confirmed',
                    html: emailContent
                })
            });
        }

        return true;
    } catch (error) {
        console.error('Error sending success email:', error);
        return false;
    }
}
