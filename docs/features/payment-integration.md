# Payment Integration (Razorpay)

Automated payment processing using Razorpay payment gateway.

## Overview

### Features
- ✅ One-click payment checkout
- ✅ Instant automated verification
- ✅ Multiple payment methods (UPI, Cards, Wallets, NetBanking)
- ✅ Immediate download link delivery
- ✅ Email receipts and notifications

---

## Quick Setup

### 1. Install Package
```bash
npm install razorpay
```

### 2. Get Razorpay Keys
1. Sign up: https://dashboard.razorpay.com/signup
2. Go to Settings → API Keys
3. Generate Test Key (for development)

### 3. Configure Environment
```bash
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_secret_key_here
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
```

### 4. Test Payment
```bash
# Use test credentials:
# UPI: success@razorpay
# Card: 4111 1111 1111 1111
```

---

## Supported Payment Methods

### UPI (Instant)
- Google Pay
- PhonePe
- Paytm
- BHIM
- Any UPI app

### Credit/Debit Cards
- Visa
- Mastercard
- RuPay

### Wallets
- PayTM
- Amazon Pay
- Mobikwik

### NetBanking
- All major Indian banks

---

## API Endpoints

### Create Order
```javascript
POST /api/create-razorpay-order
{
  "product": "basic",
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "id": "order_xxxxx",
  "amount": 49900,
  "currency": "INR"
}
```

### Verify Payment
```javascript
POST /api/verify-razorpay-payment
{
  "razorpay_order_id": "order_xxxxx",
  "razorpay_payment_id": "pay_xxxxx",
  "razorpay_signature": "xxxxx"
}
```

### Webhook Handler
```javascript
POST /api/razorpay-webhook
// Razorpay sends payment events
```

---

## Frontend Integration

### Payment Button
```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<button onclick="payWithRazorpay()">Pay ₹499</button>
```

### Payment Flow
```javascript
async function payWithRazorpay() {
  // 1. Create order
  const order = await fetch('/api/create-razorpay-order', {
    method: 'POST',
    body: JSON.stringify({ product: 'basic', email: userEmail })
  }).then(r => r.json());
  
  // 2. Open Razorpay checkout
  const options = {
    key: RAZORPAY_KEY_ID,
    amount: order.amount,
    order_id: order.id,
    handler: async function(response) {
      // 3. Verify payment
      await fetch('/api/verify-razorpay-payment', {
        method: 'POST',
        body: JSON.stringify(response)
      });
    }
  };
  
  new Razorpay(options).open();
}
```

---

## Webhook Setup

### Configure in Razorpay Dashboard
1. Go to Settings → Webhooks
2. Add endpoint: `https://yoursite.com/api/razorpay-webhook`
3. Select events:
   - `payment.captured`
   - `payment.failed`
4. Copy webhook secret to `.env`

### Verify Webhook Signature
```javascript
const crypto = require('crypto');

function verifyWebhook(body, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
  return signature === expectedSignature;
}
```

---

## Testing

### Test Cards
| Card Number | Description |
|-------------|-------------|
| 4111 1111 1111 1111 | Success |
| 5104 0600 0000 0008 | Failure |

### Test UPI
- `success@razorpay` - Success
- `failure@razorpay` - Failure

---

## Troubleshooting

### Payment Fails Immediately
- Check Razorpay key is correct
- Verify order was created successfully
- Check browser console for errors

### Webhook Not Received
- Verify webhook URL is correct
- Check webhook secret matches
- View webhook logs in Razorpay dashboard

### Credits Not Added
- Check payment verification response
- Verify Supabase connection
- Check API logs for errors
