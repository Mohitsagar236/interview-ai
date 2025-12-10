/**
 * Razorpay Order Creation API
 * Creates a Razorpay order for payment processing
 */

const Razorpay = require('razorpay');
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
        const { amount, currency = 'INR', productType, email, name, phone } = req.body;

        // Validate input
        if (!amount || !productType || !email || !name) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields' 
            });
        }

        // Initialize Razorpay instance
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });

        // Create order
        const order = await razorpay.orders.create({
            amount: amount * 100, // Razorpay expects amount in paise
            currency: currency,
            receipt: `receipt_${Date.now()}`,
            notes: {
                productType: productType,
                email: email,
                name: name,
                phone: phone || '',
                timestamp: new Date().toISOString()
            }
        });

        // Return order details
        return res.status(200).json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to create order',
            message: error.message
        });
    }
};
