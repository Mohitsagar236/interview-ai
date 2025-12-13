/**
 * PhonePe Payment Verification API
 * Verifies payment status and processes the order
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Credit mapping for each plan
const PLAN_CREDITS = {
    basic: 3,        // Basic plan: 3 credits (3 hours)
    plus: 8,         // Plus plan: 6 + 2 free = 8 credits (8 hours)
    advanced: 15     // Advanced plan: 9 + 6 free = 15 credits (15 hours)
};

// PhonePe Configuration
const PHONEPE_CONFIG = {
    prod: {
        baseUrl: 'https://api.phonepe.com/apis/hermes'
    },
    sandbox: {
        baseUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox'
    }
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
            transactionId,
            email,
            name,
            productType 
        } = req.body;

        // Validate input
        if (!transactionId) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing transaction ID' 
            });
        }

        // Get PhonePe credentials
        const merchantId = process.env.PHONEPE_MERCHANT_ID;
        const saltKey = process.env.PHONEPE_SALT_KEY;
        const saltIndex = process.env.PHONEPE_SALT_INDEX || '1';
        const isProduction = process.env.PHONEPE_ENV === 'production';

        if (!merchantId || !saltKey) {
            return res.status(500).json({
                success: false,
                error: 'PhonePe credentials not configured'
            });
        }

        // Select endpoint based on environment
        const config = isProduction ? PHONEPE_CONFIG.prod : PHONEPE_CONFIG.sandbox;

        // Check payment status with PhonePe
        const statusEndpoint = `/pg/v1/status/${merchantId}/${transactionId}`;
        const checksum = generateChecksum(statusEndpoint, saltKey, saltIndex);

        const statusUrl = `${config.baseUrl}${statusEndpoint}`;

        const response = await fetch(statusUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-VERIFY': checksum,
                'X-MERCHANT-ID': merchantId
            }
        });

        const data = await response.json();

        console.log('PhonePe verification response:', data);

        if (!data.success || data.code !== 'PAYMENT_SUCCESS') {
            return res.status(400).json({
                success: false,
                error: 'Payment not successful',
                message: data.message || 'Payment verification failed',
                code: data.code
            });
        }

        // Payment is verified successfully
        const paymentData = data.data;
        const amountInRupees = (paymentData.amount || 0) / 100;

        console.log('Payment verified successfully:', {
            transactionId,
            phonepeTransactionId: paymentData.transactionId,
            amount: amountInRupees,
            email,
            productType
        });

        // Add credits to user's account if Supabase is configured and product type is a credit plan
        if (supabase && ['basic', 'plus', 'advanced'].includes(productType)) {
            try {
                const creditsToAdd = PLAN_CREDITS[productType] || 0;
                
                // Find user by email
                const { data: userData, error: userError } = await supabase.auth.admin.getUserByEmail(email);
                
                if (userError) {
                    console.warn('Could not find user by email:', email, userError);
                } else if (userData && userData.user) {
                    const userId = userData.user.id;
                    
                    // Check if subscription exists
                    const { data: existingSub } = await supabase
                        .from('subscriptions')
                        .select('*')
                        .eq('user_id', userId)
                        .single();
                    
                    if (existingSub) {
                        // Update existing subscription - add credits
                        const { error: updateError } = await supabase
                            .from('subscriptions')
                            .update({
                                plan_type: productType,
                                status: 'active',
                                credits_total: (existingSub.credits_total || 0) + creditsToAdd,
                                payment_id: paymentData.transactionId,
                                order_id: transactionId,
                                amount: amountInRupees * 100,
                                updated_at: new Date().toISOString()
                            })
                            .eq('user_id', userId);
                        
                        if (updateError) {
                            console.error('Error updating subscription credits:', updateError);
                        } else {
                            console.log(`✅ Added ${creditsToAdd} credits to user ${email}`);
                        }
                    } else {
                        // Create new subscription
                        const { error: insertError } = await supabase
                            .from('subscriptions')
                            .insert({
                                user_id: userId,
                                plan_type: productType,
                                status: 'active',
                                credits_total: creditsToAdd,
                                credits_used: 0,
                                payment_id: paymentData.transactionId,
                                order_id: transactionId,
                                amount: amountInRupees * 100,
                                description: `${productType.charAt(0).toUpperCase() + productType.slice(1)} Plan - ${creditsToAdd} credits`
                            });
                        
                        if (insertError) {
                            console.error('Error creating subscription with credits:', insertError);
                        } else {
                            console.log(`✅ Created subscription with ${creditsToAdd} credits for user ${email}`);
                        }
                    }
                }
            } catch (creditsError) {
                console.error('Error adding credits:', creditsError);
                // Don't fail the payment, just log the error
            }
        }

        // Record payment in database
        if (supabase) {
            try {
                await supabase
                    .from('payments')
                    .upsert({
                        transaction_id: transactionId,
                        phonepe_transaction_id: paymentData.transactionId,
                        email: email,
                        name: name,
                        product_type: productType,
                        amount: amountInRupees,
                        status: 'success',
                        payment_method: paymentData.paymentInstrument?.type || 'PHONEPE',
                        verified_at: new Date().toISOString()
                    }, {
                        onConflict: 'transaction_id'
                    });
            } catch (dbError) {
                console.error('Error recording payment:', dbError);
            }
        }

        // Get download URL based on product type
        const downloadUrls = {
            basic: '/downloads/Interview AI Assistant Setup 0.1.0.exe',
            plus: '/downloads/Interview AI Assistant Setup 0.1.0.exe',
            advanced: '/downloads/Interview AI Assistant Setup 0.1.0.exe',
            windows: '/downloads/Interview AI Assistant Setup 0.1.0.exe',
            mac: '/downloads/Interview AI Assistant-0.1.0.dmg'
        };

        const downloadUrl = downloadUrls[productType] || downloadUrls.windows;

        // Send success email with download link
        await sendSuccessEmail({
            email,
            name,
            productType,
            paymentId: paymentData.transactionId || transactionId,
            downloadUrl
        });

        return res.status(200).json({
            success: true,
            message: 'Payment verified successfully',
            downloadUrl: downloadUrl,
            paymentId: paymentData.transactionId || transactionId,
            amount: amountInRupees
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
 * Generate PhonePe checksum for status check
 */
function generateChecksum(endpoint, saltKey, saltIndex) {
    const string = endpoint + saltKey;
    const sha256Hash = crypto.createHash('sha256').update(string).digest('hex');
    return sha256Hash + '###' + saltIndex;
}

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
            <p>Thank you for your purchase! Your payment has been confirmed and processed successfully via PhonePe.</p>
            
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
            <p>📧 Email: interviewai.space@gmail.com<br>
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
