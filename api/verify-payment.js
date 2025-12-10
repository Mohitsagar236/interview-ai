/**
 * UPI Payment Verification API
 * Handles payment verification and sends download links
 */

const { setupSpeedInsights } = require('./speed-insights');

module.exports = async (req, res) => {
    // Setup Speed Insights performance monitoring
    setupSpeedInsights(req, res);
    
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
            email, 
            name, 
            phone,
            transactionId, 
            paymentMethod,
            product,
            amount,
            productType
        } = req.body;

        // Validate input
        if (!email || !name || !phone || !transactionId || !product || !amount) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields' 
            });
        }

        // Expected amounts (in INR)
        const expectedAmounts = {
            windows: 3999,
            mac: 3999,
            subscription: 2999
        };

        // Verify amount matches product
        if (amount !== expectedAmounts[productType]) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid amount' 
            });
        }

        // Store payment verification request
        const paymentData = {
            email,
            name,
            phone,
            transactionId,
            paymentMethod,
            product,
            amount,
            productType,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        // In production, you would:
        // 1. Store in database (MongoDB, PostgreSQL, etc.)
        // 2. Send notification to admin for manual verification
        // 3. Send confirmation email to customer
        
        console.log('Payment verification request received:', paymentData);

        // TODO: Store in database
        // await db.collection('payments').insertOne(paymentData);

        // TODO: Send email notification to admin
        await sendAdminNotification(paymentData);

        // TODO: Send confirmation email to customer
        await sendCustomerEmail(paymentData);

        // Return success
        res.status(200).json({
            success: true,
            message: 'Payment verification submitted successfully',
            estimatedTime: '5-10 minutes',
            paymentId: generatePaymentId()
        });

    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Payment verification failed',
            message: error.message 
        });
    }
};

// Generate unique payment ID
function generatePaymentId() {
    return 'PAY-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Send notification email to admin
async function sendAdminNotification(paymentData) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@yourdomain.com';
    
    console.log('Admin notification:', {
        to: adminEmail,
        subject: `New Payment Verification Request - ${paymentData.product}`,
        data: paymentData
    });

    // TODO: Integrate with email service (SendGrid, Mailgun, etc.)
    /*
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    await sgMail.send({
        to: adminEmail,
        from: 'noreply@yourdomain.com',
        subject: `New Payment Verification Request - ₹${paymentData.amount}`,
        html: `
            <h2>New Payment Verification Request</h2>
            <p><strong>Customer:</strong> ${paymentData.name}</p>
            <p><strong>Email:</strong> ${paymentData.email}</p>
            <p><strong>Phone:</strong> ${paymentData.phone}</p>
            <p><strong>Product:</strong> ${paymentData.product}</p>
            <p><strong>Amount:</strong> ₹${paymentData.amount}</p>
            <p><strong>Transaction ID:</strong> ${paymentData.transactionId}</p>
            <p><strong>Payment Method:</strong> ${paymentData.paymentMethod}</p>
            <p><strong>Date:</strong> ${new Date(paymentData.createdAt).toLocaleString()}</p>
            <hr>
            <p>Please verify this payment and send download link if valid.</p>
        `
    });
    */
}

// Send confirmation email to customer
async function sendCustomerEmail(paymentData) {
    console.log('Customer confirmation:', {
        to: paymentData.email,
        subject: 'Payment Verification Received - Interview AI',
        message: 'Your payment is being verified'
    });

    // TODO: Integrate with email service
    /*
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    await sgMail.send({
        to: paymentData.email,
        from: 'support@yourdomain.com',
        subject: 'Payment Verification Received - Interview AI',
        html: `
            <h2>Thank you for your purchase!</h2>
            <p>Hi ${paymentData.name},</p>
            <p>We've received your payment verification request for <strong>${paymentData.product}</strong>.</p>
            <p><strong>Transaction ID:</strong> ${paymentData.transactionId}</p>
            <p><strong>Amount:</strong> ₹${paymentData.amount}</p>
            <p>Your payment is currently being verified. This usually takes <strong>5-10 minutes</strong>.</p>
            <p>Once verified, we'll send you the download link via email.</p>
            <hr>
            <p>If you have any questions, reply to this email.</p>
            <p>Best regards,<br>Interview AI Team</p>
        `
    });
    */
}
