/**
 * Payment Webhook Handler
 * Receives instant payment notifications from payment gateways
 */

const crypto = require('crypto');
const PaymentVerifier = require('../python/payment_verifier_node.js');

module.exports = async (req, res) => {
    // Only accept POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const gateway = req.query.gateway || 'razorpay';
    
    try {
        let paymentData = null;

        // Route to appropriate webhook handler
        switch (gateway) {
            case 'razorpay':
                paymentData = await handleRazorpayWebhook(req);
                break;
            case 'cashfree':
                paymentData = await handleCashfreeWebhook(req);
                break;
            case 'paytm':
                paymentData = await handlePaytmWebhook(req);
                break;
            case 'phonepe':
                paymentData = await handlePhonePeWebhook(req);
                break;
            default:
                return res.status(400).json({ error: 'Unsupported gateway' });
        }

        if (!paymentData) {
            return res.status(400).json({ error: 'Invalid webhook payload' });
        }

        // Process verified payment
        if (paymentData.verified) {
            await processVerifiedPayment(paymentData);
        }

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
};

// Razorpay Webhook Handler
async function handleRazorpayWebhook(req) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    // Verify signature
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);
    
    const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');

    if (signature !== expectedSignature) {
        throw new Error('Invalid webhook signature');
    }

    const event = req.body;

    // Handle payment.captured event
    if (event.event === 'payment.captured') {
        const payment = event.payload.payment.entity;
        
        return {
            verified: true,
            gateway: 'razorpay',
            transaction_id: payment.id,
            amount: payment.amount / 100, // Convert paise to rupees
            currency: payment.currency,
            method: payment.method,
            email: payment.email,
            phone: payment.contact,
            notes: payment.notes
        };
    }

    return null;
}

// Cashfree Webhook Handler
async function handleCashfreeWebhook(req) {
    const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET;
    
    // Verify signature
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    const body = JSON.stringify(req.body);
    
    const signedPayload = timestamp + body;
    const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(signedPayload)
        .digest('base64');

    if (signature !== expectedSignature) {
        throw new Error('Invalid webhook signature');
    }

    const event = req.body;

    // Handle ORDER_PAID event
    if (event.type === 'ORDER_PAID') {
        const order = event.data.order;
        const payment = event.data.payment;
        
        return {
            verified: true,
            gateway: 'cashfree',
            transaction_id: order.order_id,
            amount: order.order_amount,
            currency: order.order_currency,
            method: payment.payment_method,
            email: order.customer_details.customer_email,
            phone: order.customer_details.customer_phone,
            notes: order.order_tags
        };
    }

    return null;
}

// Paytm Webhook Handler
async function handlePaytmWebhook(req) {
    const webhookSecret = process.env.PAYTM_MERCHANT_KEY;
    
    // Verify checksum
    const checksum = req.body.CHECKSUMHASH;
    delete req.body.CHECKSUMHASH;
    
    const isValid = verifyPaytmChecksum(req.body, checksum, webhookSecret);
    
    if (!isValid) {
        throw new Error('Invalid webhook checksum');
    }

    const data = req.body;

    // Handle successful transaction
    if (data.STATUS === 'TXN_SUCCESS') {
        return {
            verified: true,
            gateway: 'paytm',
            transaction_id: data.TXNID,
            amount: parseFloat(data.TXNAMOUNT),
            currency: data.CURRENCY,
            method: data.PAYMENTMODE,
            email: data.EMAIL,
            phone: data.MOBILE,
            notes: { order_id: data.ORDERID }
        };
    }

    return null;
}

// PhonePe Webhook Handler
async function handlePhonePeWebhook(req) {
    const saltKey = process.env.PHONEPE_SALT_KEY;
    const saltIndex = process.env.PHONEPE_SALT_INDEX || '1';
    
    // Verify X-VERIFY header
    const xVerify = req.headers['x-verify'];
    const body = req.body;
    
    const [receivedChecksum, receivedIndex] = xVerify.split('###');
    
    const expectedChecksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(body) + saltKey)
        .digest('hex');

    if (receivedChecksum !== expectedChecksum || receivedIndex !== saltIndex) {
        throw new Error('Invalid webhook signature');
    }

    // Handle payment success
    if (body.code === 'PAYMENT_SUCCESS') {
        const payment = body.data;
        
        return {
            verified: true,
            gateway: 'phonepe',
            transaction_id: payment.merchantTransactionId,
            amount: payment.amount / 100, // Convert paise to rupees
            currency: 'INR',
            method: payment.paymentInstrument.type,
            email: payment.email,
            phone: payment.phone,
            notes: payment.merchantUserId
        };
    }

    return null;
}

// Process verified payment
async function processVerifiedPayment(paymentData) {
    console.log('Processing verified payment:', paymentData);
    
    const verifier = new PaymentVerifier();
    
    // Find matching payment record by transaction ID
    const payment = await verifier.getPaymentByTransactionId(paymentData.transaction_id);
    
    if (payment) {
        // Mark as verified and generate download token
        const result = await verifier.markPaymentVerified(
            payment.payment_id,
            paymentData
        );
        
        // Send download email
        if (result.success) {
            await sendDownloadEmail({
                email: payment.customer_email || paymentData.email,
                name: payment.customer_name,
                product: payment.product_type,
                downloadToken: result.download_token,
                downloadUrl: getDownloadUrl(payment.product_type, result.download_token)
            });
        }
    }
}

// Helper: Verify Paytm checksum
function verifyPaytmChecksum(params, checksum, key) {
    const paramsString = JSON.stringify(params, Object.keys(params).sort());
    const expectedChecksum = crypto
        .createHmac('sha256', key)
        .update(paramsString)
        .digest('hex');
    return checksum === expectedChecksum;
}

// Helper: Generate download URL
function getDownloadUrl(productType, token) {
    const DOWNLOAD_URLS = {
        windows: 'https://iylx1o61xprr6qlb.public.blob.vercel-storage.com/Interview-AI-Setup-LATEST-20251208-2117-x64.exe',
        mac: '/downloads/Interview AI Assistant-0.1.0.dmg'
    };
    const baseUrl = DOWNLOAD_URLS[productType];
    if (!baseUrl) return null;
    return `${baseUrl}?token=${token}`;
}

// Helper: Send download email (same as in verify-payment-auto.js)
async function sendDownloadEmail(data) {
    console.log('Sending download email:', data);
    // TODO: Implement email sending
}
