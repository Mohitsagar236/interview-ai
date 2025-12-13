# PhonePe Payment Integration Guide

This guide explains how to set up and configure PhonePe payment gateway for Interview AI.

## Overview

Interview AI uses PhonePe's Payment Gateway for processing payments in India. PhonePe supports:
- UPI payments (Google Pay, PhonePe, Paytm, etc.)
- Credit/Debit Cards
- Net Banking
- Wallets

## Prerequisites

1. **PhonePe Merchant Account**: Sign up at [PhonePe Business](https://business.phonepe.com/)
2. **KYC Verification**: Complete the merchant verification process
3. **API Credentials**: Obtain your Merchant ID, Salt Key, and Salt Index

## Getting Started

### 1. Register as PhonePe Merchant

1. Visit [PhonePe Developer Portal](https://developer.phonepe.com/)
2. Create a new merchant account
3. Complete KYC verification
4. Get access to the sandbox environment for testing

### 2. Obtain API Credentials

After registration, you'll receive:
- **Merchant ID**: Your unique merchant identifier
- **Salt Key**: Secret key for generating checksums
- **Salt Index**: Usually "1" for most merchants

### 3. Configure Environment Variables

Add the following to your `.env` file:

```env
# PhonePe Payment Configuration
PHONEPE_MERCHANT_ID=your_merchant_id_here
PHONEPE_SALT_KEY=your_salt_key_here
PHONEPE_SALT_INDEX=1

# Environment: 'sandbox' for testing, 'production' for live
PHONEPE_ENV=sandbox

# Your application's base URL (for callbacks)
BASE_URL=https://your-domain.com
```

## API Endpoints

The integration consists of the following API endpoints:

### 1. Create Order (`/api/create-phonepe-order`)

Creates a new payment order and returns a PhonePe payment URL.

**Request:**
```json
{
  "amount": 999,
  "currency": "INR",
  "productType": "plus",
  "email": "user@example.com",
  "name": "John Doe",
  "phone": "+919876543210"
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "MT1702475000000ABC123",
  "paymentUrl": "https://mercury.phonepe.com/transact/...",
  "amount": 99900,
  "currency": "INR"
}
```

### 2. Payment Callback (`/api/phonepe-callback`)

Handles the redirect after payment completion. Automatically verifies payment status and redirects user to success/failure page.

### 3. Webhook (`/api/phonepe-webhook`)

Receives server-to-server callbacks from PhonePe for payment status updates.

### 4. Verify Payment (`/api/verify-phonepe-payment`)

Verifies payment status and processes the order (grants credits, sends emails, etc.).

## Payment Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│  Create     │────▶│   PhonePe   │
│   (User)    │     │  Order API  │     │   Gateway   │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                    ┌─────────────────────────┘
                    ▼
              ┌─────────────┐
              │   User      │
              │   Pays      │
              └─────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌─────────────┐         ┌─────────────┐
│  Callback   │         │   Webhook   │
│  (Redirect) │         │  (S2S)      │
└─────────────┘         └─────────────┘
        │                       │
        ▼                       ▼
┌─────────────┐         ┌─────────────┐
│   Verify    │         │   Update    │
│   Payment   │         │   Database  │
└─────────────┘         └─────────────┘
        │
        ▼
┌─────────────┐
│   Success   │
│   Page      │
└─────────────┘
```

## Testing

### Sandbox Environment

Use the sandbox environment for testing:
- Set `PHONEPE_ENV=sandbox` in your environment
- Use test credentials from PhonePe developer portal

### Test Cards/UPI

PhonePe provides test credentials in their sandbox:
- Test UPI VPA: `success@phonepe` (for successful payments)
- Test UPI VPA: `failure@phonepe` (for failed payments)

## Production Checklist

Before going live:

- [ ] Complete KYC verification with PhonePe
- [ ] Switch to production credentials
- [ ] Set `PHONEPE_ENV=production`
- [ ] Update `BASE_URL` to your production domain
- [ ] Configure webhook URL in PhonePe dashboard
- [ ] Test end-to-end payment flow
- [ ] Enable SSL/HTTPS on your domain

## Webhook Configuration

Configure your webhook URL in PhonePe dashboard:

```
https://your-domain.com/api/phonepe-webhook
```

The webhook receives payment status updates for:
- Payment success
- Payment failure
- Payment pending

## Security Considerations

1. **Checksum Verification**: All API requests use SHA256 checksums
2. **HTTPS Only**: Always use HTTPS in production
3. **Webhook Validation**: All webhooks are verified using the salt key
4. **Environment Separation**: Keep sandbox and production credentials separate

## Troubleshooting

### Common Issues

1. **"Invalid Checksum" Error**
   - Verify your Salt Key is correct
   - Check Salt Index matches your merchant account
   - Ensure payload encoding is correct (Base64)

2. **"Merchant Not Found" Error**
   - Verify Merchant ID is correct
   - Ensure you're using the right environment (sandbox vs production)

3. **Callback Not Working**
   - Verify BASE_URL is publicly accessible
   - Check webhook URL is configured in PhonePe dashboard
   - Ensure no firewall blocking PhonePe IPs

### Support

For PhonePe integration support:
- Documentation: https://developer.phonepe.com/docs/
- Support Email: merchant-support@phonepe.com

## File Structure

```
api/
├── create-phonepe-order.js    # Creates payment order
├── phonepe-callback.js        # Handles payment redirect
├── phonepe-webhook.js         # Receives S2S callbacks
└── verify-phonepe-payment.js  # Verifies and processes payment

public/
├── payment.html               # Payment page
├── payment-phonepe.js         # Frontend payment logic
└── payment-success.html       # Success page after payment
```

## Migration from Razorpay

If migrating from Razorpay:

1. Update environment variables (replace Razorpay keys with PhonePe)
2. The API structure is similar but PhonePe uses redirect-based flow
3. Update webhook URL in your hosting platform
4. Test thoroughly in sandbox before going live

## Credits System

After successful payment, credits are automatically added:
- Basic Plan: 3 credits
- Plus Plan: 8 credits (6 + 2 free)
- Advanced Plan: 15 credits (9 + 6 free)
