/**
 * Stripe Payment API Endpoint
 * This handles payment intent creation for the Interview AI app
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
        const { product, email, name, amount } = req.body;

        // Validate input
        if (!product || !email || !name || !amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Product pricing (in cents)
        const prices = {
            windows: 4999,  // $49.99
            mac: 4999,      // $49.99
            subscription: 2999  // $29.99/month
        };

        // Verify amount matches product
        if (amount !== prices[product]) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        // Create a PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: 'usd',
            payment_method_types: ['card'],
            receipt_email: email,
            metadata: {
                product: product,
                customer_name: name,
                customer_email: email,
            },
            description: `Interview AI - ${product === 'windows' ? 'Windows' : product === 'mac' ? 'macOS' : 'Subscription'}`,
        });

        // Return client secret
        res.status(200).json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

    } catch (error) {
        console.error('Stripe error:', error);
        res.status(500).json({ 
            error: 'Payment processing failed',
            message: error.message 
        });
    }
};
