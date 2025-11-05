/**
 * Automated Payment Verification API
 * Handles real-time payment verification and download token generation
 */

const PaymentVerifier = require('../python/payment_verifier_node.js');

// Expected amounts (in INR)
const EXPECTED_AMOUNTS = {
    basic: 499,
    plus: 999,
    advanced: 1699,
    windows: 999,
    mac: 999,
    subscription: 999
};

// Download URLs for each product
const DOWNLOAD_URLS = {
    windows: '/downloads/Interview AI Assistant Setup 0.1.0.exe',
    mac: '/downloads/Interview AI Assistant-0.1.0.dmg'
};

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // POST: Create payment verification request
    if (req.method === 'POST') {
        try {
            const { 
                email, 
                name, 
                phone,
                transactionId, 
                paymentMethod,
                gateway,
                product,
                amount,
                productType
            } = req.body;

            // Validate input
            if (!email || !name || !transactionId || !product || !amount || !productType) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Missing required fields' 
                });
            }

            // Verify amount matches product
            if (amount !== EXPECTED_AMOUNTS[productType]) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Invalid amount' 
                });
            }

            // Initialize verifier
            const verifier = new PaymentVerifier();

            // Create payment record
            const paymentRecord = await verifier.createPaymentRecord({
                email,
                name,
                phone,
                transaction_id: transactionId,
                product_type: productType,
                amount,
                currency: 'INR',
                payment_method: paymentMethod,
                gateway: gateway || 'razorpay',
                metadata: {
                    product,
                    user_agent: req.headers['user-agent']
                }
            });

            if (!paymentRecord.success) {
                return res.status(400).json(paymentRecord);
            }

            const paymentId = paymentRecord.payment_id;

            // Attempt automatic verification
            let verificationResult = null;
            if (gateway && gateway !== 'manual') {
                try {
                    verificationResult = await verifier.verifyPayment(
                        paymentId,
                        transactionId,
                        gateway
                    );
                } catch (error) {
                    console.error('Auto-verification error:', error);
                }
            }

            // If auto-verification succeeded
            if (verificationResult && verificationResult.verified) {
                const paymentStatus = await verifier.getPaymentStatus(paymentId);
                
                // Send download link email
                await sendDownloadEmail({
                    email,
                    name,
                    product,
                    downloadToken: paymentStatus.download_token,
                    downloadUrl: getDownloadUrl(productType, paymentStatus.download_token),
                    amount
                });

                return res.status(200).json({
                    success: true,
                    verified: true,
                    payment_id: paymentId,
                    download_token: paymentStatus.download_token,
                    download_url: getDownloadUrl(productType, paymentStatus.download_token),
                    message: 'Payment verified successfully!',
                    expires_at: paymentStatus.token_expires_at
                });
            }

            // Payment pending manual verification
            return res.status(200).json({
                success: true,
                verified: false,
                payment_id: paymentId,
                message: 'Payment verification pending',
                estimated_time: '1-2 minutes',
                poll_url: `/api/verify-payment?payment_id=${paymentId}`
            });

        } catch (error) {
            console.error('Payment verification error:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Payment verification failed',
                message: error.message 
            });
        }
    }

    // GET: Check payment status (for polling)
    if (req.method === 'GET') {
        try {
            const { payment_id, token } = req.query;

            if (!payment_id && !token) {
                return res.status(400).json({
                    success: false,
                    error: 'payment_id or token required'
                });
            }

            const verifier = new PaymentVerifier();

            // Check by download token
            if (token) {
                const validation = await verifier.validateDownloadToken(token);
                
                if (validation) {
                    return res.status(200).json({
                        success: true,
                        valid: true,
                        product_type: validation.product_type,
                        download_url: getDownloadUrl(validation.product_type, token)
                    });
                } else {
                    return res.status(404).json({
                        success: false,
                        valid: false,
                        error: 'Invalid or expired token'
                    });
                }
            }

            // Check by payment ID
            const paymentStatus = await verifier.getPaymentStatus(payment_id);

            if (!paymentStatus) {
                return res.status(404).json({
                    success: false,
                    error: 'Payment not found'
                });
            }

            // If verified, return download info
            if (paymentStatus.status === 'verified') {
                return res.status(200).json({
                    success: true,
                    verified: true,
                    payment_id,
                    download_token: paymentStatus.download_token,
                    download_url: getDownloadUrl(paymentStatus.product_type, paymentStatus.download_token),
                    expires_at: paymentStatus.token_expires_at
                });
            }

            // Still pending
            return res.status(200).json({
                success: true,
                verified: false,
                payment_id,
                status: paymentStatus.status,
                message: 'Payment verification pending'
            });

        } catch (error) {
            console.error('Status check error:', error);
            return res.status(500).json({
                success: false,
                error: 'Status check failed',
                message: error.message
            });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

// Helper: Generate download URL with token
function getDownloadUrl(productType, token) {
    const baseUrl = DOWNLOAD_URLS[productType];
    if (!baseUrl) return null;
    return `${baseUrl}?token=${token}`;
}

// Helper: Send download email
async function sendDownloadEmail(data) {
    const { email, name, product, downloadToken, downloadUrl, amount } = data;
    
    console.log('Sending download email:', {
        to: email,
        subject: 'Your Interview AI Download is Ready!',
        product
    });

    try {
        const { getEmailService } = require('./email-service');
        const emailService = getEmailService();
        
        await emailService.sendDownloadEmail({
            email,
            name,
            product,
            downloadUrl,
            downloadToken,
            amount
        });
        
        console.log('✓ Download email sent successfully');
    } catch (error) {
        console.error('✗ Failed to send download email:', error.message);
        // Don't throw - payment is still verified even if email fails
    }
}
