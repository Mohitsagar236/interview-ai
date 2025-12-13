/**
 * PhonePe Webhook Handler
 * Receives server-to-server callbacks from PhonePe
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

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-VERIFY');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get PhonePe credentials
        const saltKey = process.env.PHONEPE_SALT_KEY;
        const saltIndex = process.env.PHONEPE_SALT_INDEX || '1';

        if (!saltKey) {
            console.error('PhonePe salt key not configured');
            return res.status(500).json({ error: 'Configuration error' });
        }

        // Verify webhook signature
        const receivedChecksum = req.headers['x-verify'];
        const response = req.body.response;

        if (!response) {
            return res.status(400).json({ error: 'Missing response data' });
        }

        // Verify checksum
        const expectedChecksum = generateChecksum(response, saltKey, saltIndex);

        if (receivedChecksum !== expectedChecksum) {
            console.error('Invalid webhook checksum');
            return res.status(400).json({ error: 'Invalid signature' });
        }

        // Decode the response
        const decodedResponse = JSON.parse(Buffer.from(response, 'base64').toString('utf-8'));

        console.log('PhonePe webhook received:', decodedResponse);

        const { code, data } = decodedResponse;

        if (code === 'PAYMENT_SUCCESS') {
            const {
                merchantId,
                merchantTransactionId,
                transactionId: phonepeTransactionId,
                amount,
                paymentInstrument
            } = data;

            // Amount is in paise, convert to rupees
            const amountInRupees = amount / 100;

            console.log('Payment successful:', {
                merchantTransactionId,
                phonepeTransactionId,
                amount: amountInRupees
            });

            // Process the successful payment
            // You should look up the original order from your database
            // and update it with the payment details

            // For now, we'll just log the success
            // In production, you should:
            // 1. Look up order details from database using merchantTransactionId
            // 2. Update order status to 'paid'
            // 3. Grant credits/access to user
            // 4. Send confirmation email

            if (supabase) {
                try {
                    // Try to find and update the payment record
                    const { error: updateError } = await supabase
                        .from('payments')
                        .upsert({
                            transaction_id: merchantTransactionId,
                            phonepe_transaction_id: phonepeTransactionId,
                            amount: amountInRupees,
                            status: 'success',
                            payment_method: paymentInstrument?.type || 'PHONEPE',
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'transaction_id'
                        });

                    if (updateError) {
                        console.error('Error updating payment record:', updateError);
                    }
                } catch (dbError) {
                    console.error('Database error:', dbError);
                }
            }

            return res.status(200).json({
                success: true,
                message: 'Payment processed successfully'
            });

        } else if (code === 'PAYMENT_ERROR' || code === 'PAYMENT_DECLINED') {
            // Payment failed
            console.log('Payment failed:', {
                code,
                transactionId: data?.merchantTransactionId
            });

            if (supabase && data?.merchantTransactionId) {
                try {
                    await supabase
                        .from('payments')
                        .upsert({
                            transaction_id: data.merchantTransactionId,
                            status: 'failed',
                            error_code: code,
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'transaction_id'
                        });
                } catch (dbError) {
                    console.error('Database error:', dbError);
                }
            }

            return res.status(200).json({
                success: true,
                message: 'Payment failure recorded'
            });

        } else {
            // Other status
            console.log('Payment status:', code);
            return res.status(200).json({
                success: true,
                message: 'Status received'
            });
        }

    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(500).json({
            success: false,
            error: 'Webhook processing failed',
            message: error.message
        });
    }
};

/**
 * Generate PhonePe checksum for verification
 */
function generateChecksum(response, saltKey, saltIndex) {
    const string = response + saltKey;
    const sha256Hash = crypto.createHash('sha256').update(string).digest('hex');
    return sha256Hash + '###' + saltIndex;
}
