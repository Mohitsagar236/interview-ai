# Razorpay Integration Setup Guide

## Overview
This project now uses **Razorpay** for automated payment processing, eliminating the need for manual form filling and verification. Payments are processed instantly with support for UPI, Cards, Wallets, and Net Banking.

## Features
✅ **Instant Payment Processing** - No manual verification needed
✅ **Multiple Payment Methods** - UPI, Cards, Wallets, Net Banking
✅ **Automatic Download Links** - Sent immediately after payment
✅ **Secure Transactions** - PCI DSS compliant payment gateway
✅ **Real-time Verification** - Payment status updated instantly
✅ **Email Notifications** - Automatic receipt and download link delivery

## Setup Instructions

### 1. Create Razorpay Account

1. Visit [Razorpay Dashboard](https://dashboard.razorpay.com/signup)
2. Sign up for a free account
3. Complete KYC verification (required for live transactions)

### 2. Get API Keys

1. Go to [API Keys](https://dashboard.razorpay.com/app/keys)
2. Copy your **Key ID** and **Key Secret**
3. Note: Use Test keys for development, Live keys for production

### 3. Configure Environment Variables

Create a `.env` file in your project root:

```bash
# Razorpay API Keys
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_secret_key_here

# Razorpay Webhook Secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here

# Application URLs
APP_URL=https://yourdomain.com
DOWNLOAD_BASE_URL=https://yourdomain.com/downloads
```

### 4. Setup Webhooks

1. Go to [Webhooks](https://dashboard.razorpay.com/app/webhooks)
2. Click "Add New Webhook"
3. Enter webhook URL: `https://yourdomain.com/api/razorpay-webhook`
4. Select events to listen:
   - ✅ `payment.captured`
   - ✅ `payment.failed`
   - ✅ `order.paid`
5. Copy the **Webhook Secret** and add to `.env`

### 5. Install Dependencies

```bash
npm install razorpay
```

### 6. Test Payment Flow

#### Test Mode:
1. Use test API keys
2. Test UPI: success@razorpay
3. Test Cards: 4111 1111 1111 1111 (any CVV, future expiry)
4. Test Payment will complete instantly

#### Live Mode:
1. Switch to live API keys after KYC approval
2. Real payments will be processed
3. Webhooks will trigger automatically

## API Endpoints

### 1. Create Order - `/api/create-razorpay-order`
Creates a Razorpay order for payment processing

**Request:**
```json
{
  "amount": 999,
  "currency": "INR",
  "productType": "windows",
  "email": "user@example.com",
  "name": "John Doe",
  "phone": "+919876543210"
}
```

**Response:**
```json
{
  "success": true,
  "orderId": "order_xxxxxxxxxxxxx",
  "amount": 99900,
  "currency": "INR",
  "keyId": "rzp_test_xxxxxxxxxxxxx"
}
```

### 2. Verify Payment - `/api/verify-razorpay-payment`
Verifies payment signature and processes download

**Request:**
```json
{
  "razorpay_order_id": "order_xxxxxxxxxxxxx",
  "razorpay_payment_id": "pay_xxxxxxxxxxxxx",
  "razorpay_signature": "signature_here",
  "email": "user@example.com",
  "name": "John Doe",
  "productType": "windows"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment verified successfully",
  "downloadUrl": "/downloads/Interview AI Assistant Setup 0.1.0.exe",
  "paymentId": "pay_xxxxxxxxxxxxx"
}
```

### 3. Webhook Handler - `/api/razorpay-webhook`
Automatically processes payment events from Razorpay

## Payment Flow

```
User fills form → Create Razorpay Order → Open Razorpay Checkout
                                                    ↓
                                          User completes payment
                                                    ↓
                                     Payment captured by Razorpay
                                                    ↓
                        Webhook triggers + Frontend verification
                                                    ↓
                              Email sent with download link
                                                    ↓
                                    Automatic download starts
```

## Supported Payment Methods

### 1. **UPI (Unified Payments Interface)**
- Google Pay (GPay)
- PhonePe
- Paytm
- BHIM
- Any UPI app

### 2. **Credit/Debit Cards**
- Visa
- Mastercard
- RuPay
- American Express

### 3. **Net Banking**
- All major Indian banks
- 50+ banks supported

### 4. **Wallets**
- Paytm Wallet
- PhonePe Wallet
- Freecharge
- MobiKwik

## Pricing Configuration

Edit `public/payment-razorpay.js` to update prices:

```javascript
const PAYMENT_CONFIG = {
    prices: {
        basic: 499,      // ₹499
        plus: 999,       // ₹999
        advanced: 1699,  // ₹1,699
        windows: 999,    // ₹999
        mac: 999,        // ₹999
        subscription: 999  // ₹999/month
    }
};
```

## Email Integration (Optional)

For automatic email notifications, integrate with:

### Option 1: SendGrid
```bash
npm install @sendgrid/mail
```

### Option 2: AWS SES
```bash
npm install @aws-sdk/client-ses
```

### Option 3: Nodemailer
```bash
npm install nodemailer
```

Update `EMAIL_SERVICE_URL` in `.env` with your email service endpoint.

## Testing Checklist

- [ ] Razorpay account created and verified
- [ ] API keys configured in `.env`
- [ ] Webhook URL added in Razorpay dashboard
- [ ] Test payment with test credentials
- [ ] Email notifications working
- [ ] Download links accessible
- [ ] Error handling tested
- [ ] Live keys configured for production

## Security Best Practices

1. **Never expose secrets** - Keep API keys in `.env`, never commit them
2. **Verify signatures** - Always verify Razorpay webhook signatures
3. **Use HTTPS** - Deploy only on secure HTTPS domains
4. **Validate amounts** - Double-check amounts before processing
5. **Log transactions** - Maintain payment logs for auditing

## Deployment

### Vercel
1. Add environment variables in Vercel dashboard
2. Deploy: `vercel --prod`
3. Update webhook URL in Razorpay dashboard

### Netlify
1. Add environment variables in Netlify dashboard
2. Deploy: `netlify deploy --prod`
3. Update webhook URL in Razorpay dashboard

### Other Platforms
- Ensure serverless functions are enabled
- Configure environment variables
- Update webhook URL accordingly

## Troubleshooting

### Payment Not Processing
- Check API keys are correct
- Verify webhook URL is accessible
- Check Razorpay dashboard for errors

### Download Link Not Sent
- Verify email service is configured
- Check webhook logs in Razorpay dashboard
- Ensure email templates are correct

### Signature Verification Failed
- Confirm RAZORPAY_KEY_SECRET is correct
- Check webhook secret matches
- Verify request payload is not modified

## Support

- **Razorpay Docs**: https://razorpay.com/docs/
- **Razorpay Support**: https://razorpay.com/support/
- **API Reference**: https://razorpay.com/docs/api/

## License

This integration is part of Interview AI and follows the same license terms.
