# 💳 Payment Integration Setup Guide

## Overview
This guide explains how to set up the Stripe payment system for Interview AI.

---

## 🎯 What Was Added

### Frontend Files (Demo Mode - Ready to Use)
- ✅ **payment.html** - Payment checkout page
- ✅ **payment.css** - Payment page styling
- ✅ **payment.js** - Payment processing logic (Demo mode active)

### Backend Files (Production Ready)
- ✅ **api/create-payment-intent.js** - Creates Stripe payment
- ✅ **api/stripe-webhook.js** - Handles payment confirmations

### Updated Files
- ✅ **index.html** - Download buttons now redirect to payment page
- ✅ **vercel.json** - API routes configured
- ✅ **package.json** - Stripe package installed

---

## 🚀 DEMO MODE (Current State)

**The payment page is currently in DEMO mode**, which means:

✅ Payment page fully functional UI
✅ Form validation working
✅ No real charges made
✅ Simulated success flow
✅ Download works after "payment"

### How Demo Mode Works:
1. User clicks "Purchase" on index.html
2. Redirected to payment.html
3. Fill in email, name, card details (any fake data works)
4. Click "Pay $49.99"
5. Simulated 2-second processing
6. Success modal appears
7. Download starts automatically

**Perfect for testing the UI/UX without setting up Stripe!**

---

## 💰 PRODUCTION MODE (Enable Real Payments)

### Step 1: Create Stripe Account

1. Go to https://stripe.com
2. Sign up for an account
3. Complete business verification
4. Get your API keys from Dashboard → Developers → API keys

### Step 2: Add Stripe Keys to Environment

Add these to your `.env` file:

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_live_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

**For testing**, use test keys:
```bash
STRIPE_SECRET_KEY=sk_test_your_test_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key_here
```

### Step 3: Add Keys to Vercel

```bash
# Via Vercel CLI
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_PUBLISHABLE_KEY
vercel env add STRIPE_WEBHOOK_SECRET

# Or via Vercel Dashboard:
# Settings → Environment Variables → Add
```

### Step 4: Update payment.js

Edit `public/payment.js` line 2:

```javascript
// BEFORE (Demo):
const STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_STRIPE_KEY_HERE';

// AFTER (Production):
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51ABC123...'; // Your real key
```

### Step 5: Enable Stripe Integration

In `public/payment.js`, find lines 93-95 and **uncomment**:

```javascript
// BEFORE:
// initializeStripe();

// AFTER:
initializeStripe();
```

Then **comment out** the demo payment (lines 104-106):

```javascript
// BEFORE:
await simulatePayment(email, name);

// AFTER:
// await simulatePayment(email, name);
```

And **uncomment** the real Stripe code (lines 108-145):

```javascript
// Remove the /* and */ around the production code
```

### Step 6: Configure Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. URL: `https://interview-ai.vercel.app/api/stripe-webhook`
4. Events to listen: 
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. Copy webhook signing secret
6. Add to Vercel env: `STRIPE_WEBHOOK_SECRET`

### Step 7: Deploy

```bash
# Commit changes
git add .
git commit -m "Enable Stripe production mode"
git push

# Deploy to Vercel
vercel --prod
```

---

## 🧪 Testing in Production Mode

### Test Cards (Stripe Test Mode)

**Success:**
- Card: `4242 4242 4242 4242`
- Expiry: Any future date (e.g., 12/25)
- CVC: Any 3 digits (e.g., 123)
- ZIP: Any 5 digits (e.g., 12345)

**Decline:**
- Card: `4000 0000 0000 0002`

**3D Secure:**
- Card: `4000 0027 6000 3184`

### Test Flow:

1. Visit your site
2. Click "Purchase for $49.99"
3. Enter test card details
4. Submit payment
5. Check Stripe Dashboard → Payments
6. Verify webhook received
7. Check email delivery (if configured)

---

## 💸 Pricing Configuration

Edit prices in `public/payment.js`:

```javascript
const products = {
    windows: {
        price: 49.99,  // Change price here
        ...
    },
    mac: {
        price: 49.99,  // Change price here
        ...
    }
};
```

Also update in `api/create-payment-intent.js`:

```javascript
const prices = {
    windows: 4999,  // Price in cents (49.99 * 100)
    mac: 4999,
};
```

---

## 📧 Email Integration (Optional)

To send download links via email after payment:

### Option 1: SendGrid

```bash
npm install @sendgrid/mail
```

Update `api/stripe-webhook.js`:

```javascript
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendDownloadEmail(email, name, product) {
    const msg = {
        to: email,
        from: 'support@yourdomain.com',
        subject: 'Your Interview AI Download Link',
        html: `
            <h1>Thank you for your purchase!</h1>
            <p>Hi ${name},</p>
            <p><a href="${downloadUrls[product]}">Download Interview AI</a></p>
        `,
    };
    
    await sgMail.send(msg);
}
```

### Option 2: Mailgun, AWS SES, etc.

Similar integration - just install package and configure.

---

## 🔒 Security Best Practices

### 1. Never Commit API Keys
```bash
# .gitignore already excludes .env
# Always use environment variables
```

### 2. Verify Webhook Signatures
```javascript
// Already implemented in stripe-webhook.js
stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
```

### 3. Validate Amounts Server-Side
```javascript
// Already implemented in create-payment-intent.js
if (amount !== prices[product]) {
    return res.status(400).json({ error: 'Invalid amount' });
}
```

### 4. Use HTTPS Only
Stripe requires HTTPS - Vercel provides this automatically.

---

## 📊 Payment Flow Diagram

```
┌─────────────────────────────────────┐
│ 1. User clicks "Purchase"           │
│    on index.html                    │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 2. Redirected to payment.html       │
│    with ?product=windows/mac        │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 3. User fills form                  │
│    Email, Name, Card Details        │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 4. Click "Pay $49.99"               │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 5. Frontend calls:                  │
│    /api/create-payment-intent       │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 6. Backend creates Stripe           │
│    PaymentIntent, returns           │
│    clientSecret                     │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 7. Frontend confirms payment        │
│    with Stripe.js                   │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 8. Stripe processes payment         │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 9. Stripe calls webhook:            │
│    /api/stripe-webhook              │
│    with payment_intent.succeeded    │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 10. Backend sends email with        │
│     download link                   │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 11. Frontend shows success modal    │
│     Starts download automatically   │
└─────────────────────────────────────┘
```

---

## 🛠️ Troubleshooting

### Payment Not Processing
```
Check browser console for errors
Verify Stripe publishable key is correct
Check Stripe Dashboard → Logs
```

### Webhook Not Receiving Events
```
Verify webhook URL is correct
Check webhook signing secret
Test endpoint: https://your-site.vercel.app/api/stripe-webhook
```

### Download Not Starting
```
Check if file exists in public/downloads/
Verify downloadUrl in payment.js
Check browser download settings
```

### Amount Mismatch Error
```
Ensure price in payment.js matches
Ensure price in create-payment-intent.js matches
Remember: Stripe uses cents (49.99 = 4999 cents)
```

---

## 💡 Current State Summary

**✅ DEMO MODE ACTIVE** - Test the UI without Stripe setup
- Payment page fully functional
- No real charges
- Perfect for development

**🔜 PRODUCTION READY** - Follow steps above to enable:
- Real Stripe payments
- Automatic email delivery
- Webhook confirmations
- Secure processing

---

## 📝 Files Modified

```
public/
  ├── payment.html        (NEW) - Payment checkout page
  ├── payment.css         (NEW) - Styling
  ├── payment.js          (NEW) - Demo mode active
  └── index.html          (UPDATED) - Download buttons

api/
  ├── create-payment-intent.js  (NEW) - Payment API
  └── stripe-webhook.js         (NEW) - Webhook handler

vercel.json               (UPDATED) - API routes
package.json              (UPDATED) - Stripe dependency
```

---

## 🎉 You're All Set!

**Demo Mode:** Works right now, no setup needed!
**Production:** Follow 7 simple steps above

**Questions?** Check Stripe docs: https://stripe.com/docs
