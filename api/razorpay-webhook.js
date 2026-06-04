/**
 * Razorpay Webhook Handler
 * Verifies payment and sends download links automatically
 */

const crypto = require('crypto');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-razorpay-signature');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Verify webhook signature
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers['x-razorpay-signature'];
        
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (signature !== expectedSignature) {
            return res.status(400).json({ error: 'Invalid signature' });
        }

        const event = req.body.event;
        const payload = req.body.payload.payment.entity;

        // Handle payment.captured event
        if (event === 'payment.captured') {
            const paymentId = payload.id;
            const orderId = payload.order_id;
            const amount = payload.amount / 100; // Convert from paise to rupees
            const email = payload.email;
            const contact = payload.contact;
            const notes = payload.notes || {};

            console.log('Payment captured:', {
                paymentId,
                orderId,
                amount,
                email,
                productType: notes.productType
            });

            // Send download link email
            await sendDownloadEmail({
                email: email || notes.email,
                name: notes.name,
                productType: notes.productType,
                paymentId: paymentId,
                amount: amount
            });

            return res.status(200).json({ 
                success: true, 
                message: 'Payment processed successfully' 
            });
        }

        // Handle other events if needed
        return res.status(200).json({ 
            success: true, 
            message: 'Event received' 
        });

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
 * Send download link email
 */
async function sendDownloadEmail({ email, name, productType, paymentId, amount }) {
    try {
        // Product download URLs from Cloudflare R2 (unlimited bandwidth, no egress fees!)
        const R2_BASE_URL = process.env.R2_PUBLIC_URL || 'https://pub-25ab7498cafd4a708df4eafca6fa14a3.r2.dev';
        const downloadUrls = {
            basic: `${R2_BASE_URL}/releases/v0.1.0/Interview-AI-Setup-0.1.0-x64.exe`,
            plus: `${R2_BASE_URL}/releases/v0.1.0/Interview-AI-Setup-0.1.0-x64.exe`,
            advanced: `${R2_BASE_URL}/releases/v0.1.0/Interview-AI-Setup-0.1.0-x64.exe`,
            windows: `${R2_BASE_URL}/releases/v0.1.0/Interview-AI-Setup-0.1.0-x64.exe`,
            mac: `${R2_BASE_URL}/releases/v0.1.0/Interview-AI-0.1.0.dmg`
        };

        const downloadUrl = downloadUrls[productType] || downloadUrls.windows;

        // Email content
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
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Payment Successful!</h1>
            <p>Your Interview AI Assistant is ready to download</p>
        </div>
        <div class="content">
            <p>Hi ${name},</p>
            <p>Thank you for your purchase! Your payment has been confirmed.</p>
            
            <h3>Order Details:</h3>
            <ul>
                <li><strong>Product:</strong> ${productType}</li>
                <li><strong>Amount Paid:</strong> ₹${amount}</li>
                <li><strong>Payment ID:</strong> ${paymentId}</li>
            </ul>

            <p style="text-align: center;">
                <a href="${downloadUrl}" class="button">Download Now</a>
            </p>

            <h3>What's Next?</h3>
            <ol>
                <li>Click the download button above</li>
                <li>Install the application</li>
                <li>Launch and start using Interview AI</li>
            </ol>

            <p><strong>Need Help?</strong> Contact us at support@yourdomain.com</p>
        </div>
        <div class="footer">
            <p>© 2025 Interview AI. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `;

        // Here you would integrate with your email service (SendGrid, AWS SES, etc.)
        // For now, we'll just log it
        console.log('Email would be sent to:', email);
        console.log('Download URL:', downloadUrl);

        // Example using fetch to call your email service API
        if (process.env.EMAIL_SERVICE_URL) {
            await fetch(process.env.EMAIL_SERVICE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: email,
                    subject: 'Your Interview AI Download Link',
                    html: emailContent
                })
            });
        }

        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}
