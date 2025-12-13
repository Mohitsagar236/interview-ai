/**
 * PhonePe Payment Callback Handler
 * Handles redirect after payment completion
 */

const crypto = require('crypto');

// PhonePe Configuration
const PHONEPE_CONFIG = {
    prod: {
        statusUrl: 'https://api.phonepe.com/apis/hermes/pg/v1/status'
    },
    sandbox: {
        statusUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status'
    }
};

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Get transaction ID from query params
        const transactionId = req.query.transactionId || req.body?.transactionId;

        if (!transactionId) {
            return redirectWithError(res, 'Transaction ID not found');
        }

        // Get PhonePe credentials
        const merchantId = process.env.PHONEPE_MERCHANT_ID;
        const saltKey = process.env.PHONEPE_SALT_KEY;
        const saltIndex = process.env.PHONEPE_SALT_INDEX || '1';
        const isProduction = process.env.PHONEPE_ENV === 'production';

        if (!merchantId || !saltKey) {
            return redirectWithError(res, 'Payment configuration error');
        }

        // Select endpoint based on environment
        const config = isProduction ? PHONEPE_CONFIG.prod : PHONEPE_CONFIG.sandbox;

        // Check payment status
        const statusEndpoint = `/pg/v1/status/${merchantId}/${transactionId}`;
        const checksum = generateChecksum(statusEndpoint, saltKey, saltIndex);

        const statusUrl = `${isProduction ? 'https://api.phonepe.com/apis/hermes' : 'https://api-preprod.phonepe.com/apis/pg-sandbox'}${statusEndpoint}`;

        const response = await fetch(statusUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-VERIFY': checksum,
                'X-MERCHANT-ID': merchantId
            }
        });

        const data = await response.json();

        console.log('PhonePe payment status:', data);

        if (data.success && data.code === 'PAYMENT_SUCCESS') {
            // Payment successful
            const paymentData = data.data;
            const baseUrl = process.env.BASE_URL || 'https://interview-ai.vercel.app';

            // Redirect to success page with payment details
            return res.redirect(302, 
                `${baseUrl}/payment-success.html?` +
                `transactionId=${transactionId}` +
                `&paymentId=${paymentData?.transactionId || transactionId}` +
                `&amount=${(paymentData?.amount || 0) / 100}` +
                `&status=success`
            );

        } else if (data.code === 'PAYMENT_PENDING') {
            // Payment is pending
            const baseUrl = process.env.BASE_URL || 'https://interview-ai.vercel.app';
            return res.redirect(302, 
                `${baseUrl}/payment.html?status=pending&transactionId=${transactionId}`
            );

        } else {
            // Payment failed
            return redirectWithError(res, data.message || 'Payment failed', data.code);
        }

    } catch (error) {
        console.error('Callback error:', error);
        return redirectWithError(res, 'Payment verification failed');
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
 * Redirect to payment page with error
 */
function redirectWithError(res, message, code = 'ERROR') {
    const baseUrl = process.env.BASE_URL || 'https://interview-ai.vercel.app';
    return res.redirect(302, 
        `${baseUrl}/payment.html?status=failed&error=${encodeURIComponent(message)}&code=${code}`
    );
}
