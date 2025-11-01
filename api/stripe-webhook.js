/**
 * Stripe Webhook Handler
 * Processes payment confirmation and sends download links
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// In production, you'd use an email service like SendGrid or AWS SES
async function sendDownloadEmail(email, name, product) {
    console.log(`Sending download email to ${email} for ${product}`);
    
    // Email template would go here
    // For now, just log it
    const downloadUrls = {
        windows: 'https://interview-ai.vercel.app/downloads/Interview AI Assistant Setup 0.1.0.exe',
        mac: 'https://interview-ai.vercel.app/downloads/Interview AI Assistant-0.1.0.dmg'
    };
    
    const emailData = {
        to: email,
        subject: 'Your Interview AI Download Link',
        body: `
            Hi ${name},
            
            Thank you for purchasing Interview AI!
            
            Download Link: ${downloadUrls[product] || 'Check your account'}
            
            Your license key will be sent in a separate email.
            
            If you have any questions, reply to this email.
            
            Best regards,
            Interview AI Team
        `
    };
    
    // TODO: Integrate with SendGrid, Mailgun, or AWS SES
    console.log('Email data:', emailData);
}

module.exports = async (req, res) => {
    // Verify webhook signature
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    
    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            webhookSecret
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    // Handle the event
    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            console.log('Payment succeeded:', paymentIntent.id);
            
            // Extract metadata
            const { product, customer_name, customer_email } = paymentIntent.metadata;
            
            // Send download email
            await sendDownloadEmail(customer_email, customer_name, product);
            
            // TODO: Store purchase in database
            // TODO: Generate license key
            // TODO: Add to mailing list
            
            break;
            
        case 'payment_intent.payment_failed':
            const failedPayment = event.data.object;
            console.log('Payment failed:', failedPayment.id);
            // TODO: Send failure notification
            break;
            
        default:
            console.log(`Unhandled event type: ${event.type}`);
    }
    
    res.json({ received: true });
};
