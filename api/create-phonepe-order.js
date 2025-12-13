/**
 * PhonePe Order Creation API
 * Creates a PhonePe payment request for processing
 */

const crypto = require('crypto');

// PhonePe Configuration
const PHONEPE_CONFIG = {
    // Production endpoints
    prod: {
        baseUrl: 'https://api.phonepe.com/apis/hermes',
        payPageUrl: 'https://api.phonepe.com/apis/hermes/pg/v1/pay'
    },
    // Sandbox/UAT endpoints
    sandbox: {
        baseUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
        payPageUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay'
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
        const { amount, currency = 'INR', productType, email, name, phone } = req.body;

        // Validate input
        if (!amount || !productType || !email || !name) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields' 
            });
        }

        // Get PhonePe credentials from environment
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

        // Generate unique transaction ID
        const merchantTransactionId = `MT${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const merchantUserId = `MU${email.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)}`;

        // Callback URLs
        const baseUrl = process.env.BASE_URL || 'https://interview-ai.vercel.app';
        const redirectUrl = `${baseUrl}/api/phonepe-callback?transactionId=${merchantTransactionId}`;
        const callbackUrl = `${baseUrl}/api/phonepe-webhook`;

        // Create payment payload
        const paymentPayload = {
            merchantId: merchantId,
            merchantTransactionId: merchantTransactionId,
            merchantUserId: merchantUserId,
            amount: amount * 100, // PhonePe expects amount in paise
            redirectUrl: redirectUrl,
            redirectMode: 'REDIRECT',
            callbackUrl: callbackUrl,
            mobileNumber: phone?.replace(/\D/g, '').slice(-10) || '',
            paymentInstrument: {
                type: 'PAY_PAGE'
            }
        };

        // Encode payload to base64
        const base64Payload = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

        // Generate checksum
        const checksum = generateChecksum(base64Payload, '/pg/v1/pay', saltKey, saltIndex);

        // Make API request to PhonePe
        const response = await fetch(config.payPageUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-VERIFY': checksum
            },
            body: JSON.stringify({
                request: base64Payload
            })
        });

        const data = await response.json();

        if (data.success && data.data?.instrumentResponse?.redirectInfo?.url) {
            // Store transaction details for verification later
            // In production, save this to database
            console.log('PhonePe order created:', {
                transactionId: merchantTransactionId,
                amount: amount,
                email: email,
                productType: productType
            });

            return res.status(200).json({
                success: true,
                transactionId: merchantTransactionId,
                paymentUrl: data.data.instrumentResponse.redirectInfo.url,
                amount: amount * 100,
                currency: currency
            });
        } else {
            console.error('PhonePe API error:', data);
            return res.status(400).json({
                success: false,
                error: data.message || 'Failed to create payment order',
                code: data.code
            });
        }

    } catch (error) {
        console.error('Error creating PhonePe order:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to create order',
            message: error.message
        });
    }
};

/**
 * Generate PhonePe checksum
 */
function generateChecksum(base64Payload, endpoint, saltKey, saltIndex) {
    const string = base64Payload + endpoint + saltKey;
    const sha256Hash = crypto.createHash('sha256').update(string).digest('hex');
    return sha256Hash + '###' + saltIndex;
}
