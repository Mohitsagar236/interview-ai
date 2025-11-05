# Razorpay Payment Integration - Quick Setup

## 🚀 Quick Start

This guide will help you set up Razorpay payment integration in under 10 minutes.

### Step 1: Install Razorpay Package

```bash
npm install razorpay
```

### Step 2: Get Razorpay API Keys

1. **Sign up**: Visit [Razorpay Dashboard](https://dashboard.razorpay.com/signup)
2. **Get Test Keys**: Go to Settings → API Keys → Generate Test Key
3. **Copy Keys**: You'll get:
   - Key ID: `rzp_test_xxxxxxxxxxxxx`
   - Key Secret: `xxxxxxxxxxxxxxxxxx`

### Step 3: Configure Environment Variables

Create a `.env` file in your project root (or add to existing):

```bash
# Razorpay API Keys
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_secret_key_here
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
```

### Step 4: Setup Webhook (Optional but Recommended)

1. Go to [Webhooks](https://dashboard.razorpay.com/app/webhooks)
2. Add webhook URL: `https://yourdomain.com/api/razorpay-webhook`
3. Select event: `payment.captured`
4. Copy webhook secret and add to `.env`

### Step 5: Test the Integration

#### Using Test Mode (Recommended First):

1. Keep test API keys in `.env`
2. Open payment page: `http://localhost:3000/payment.html?product=windows`
3. Fill in any test details:
   - Email: `test@test.com`
   - Name: `Test User`
   - Phone: `+919999999999`
4. Click "Proceed to Payment"
5. Use test UPI ID: `success@razorpay`
6. Payment will complete instantly!

#### Test Credentials:

**UPI:**
- Success: `success@razorpay`
- Failure: `failure@razorpay`

**Cards:**
- Success: `4111 1111 1111 1111` (any CVV, future date)
- Failure: `4111 1111 1111 1234`

### Step 6: Go Live

1. Complete KYC verification in Razorpay dashboard
2. Generate Live API keys
3. Replace test keys with live keys in `.env`:
```bash
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_live_secret_here
```
4. Update webhook URL to production domain
5. Done! Real payments will now work

## 📁 Files Modified

### New API Files:
- `api/create-razorpay-order.js` - Creates payment orders
- `api/verify-razorpay-payment.js` - Verifies payments
- `api/razorpay-webhook.js` - Handles webhooks

### Updated Frontend:
- `public/payment.html` - Simplified UI
- `public/payment-razorpay.js` - Payment logic

## 💳 Payment Flow

```
1. User enters email, name, phone
2. Clicks "Proceed to Payment"
3. Razorpay checkout opens
4. User completes payment (UPI/Card/etc)
5. Payment verified automatically
6. Download link sent to email
7. File downloads automatically
```

## ✨ Features Included

✅ **No Manual Verification** - Instant automated processing
✅ **Multiple Payment Methods** - UPI, Cards, Wallets, NetBanking
✅ **Automatic Emails** - Download links sent instantly
✅ **Secure** - PCI DSS compliant
✅ **Mobile Friendly** - Works on all devices
✅ **Real-time Updates** - Instant payment status

## 🛠️ Customization

### Update Prices

Edit `public/payment-razorpay.js`:

```javascript
prices: {
    basic: 499,      // ₹499
    plus: 999,       // ₹999
    advanced: 1699,  // ₹1,699
    windows: 999,    // ₹999
    mac: 999,        // ₹999
}
```

### Change Product Names

Edit `public/payment-razorpay.js` in the `products` object:

```javascript
windows: {
    name: 'Your Product Name',
    description: 'Your Description',
    price: 999,
    downloadUrl: 'downloads/your-file.exe'
}
```

### Custom Email Templates

Edit `api/verify-razorpay-payment.js` in the `sendSuccessEmail` function.

## 📊 Testing Checklist

- [ ] Razorpay account created
- [ ] Test API keys added to `.env`
- [ ] npm install completed
- [ ] Payment page loads correctly
- [ ] Test payment completes successfully
- [ ] Webhook configured (optional)
- [ ] Email notifications working
- [ ] Download link accessible

## 🚨 Troubleshooting

### Payment Not Opening?
- Check if `RAZORPAY_KEY_ID` is set correctly
- Ensure Razorpay script is loaded (check browser console)
- Verify API endpoint URLs are correct

### Payment Successful but No Download?
- Check email service configuration
- Verify webhook is set up correctly
- Check server logs for errors

### "Order Creation Failed"?
- Verify `RAZORPAY_KEY_SECRET` is correct
- Check API endpoint is accessible
- Ensure amount is valid (> 0)

## 📞 Support

- **Razorpay Docs**: https://razorpay.com/docs/
- **API Reference**: https://razorpay.com/docs/api/
- **Support**: https://razorpay.com/support/

## 🎉 You're All Set!

Your payment integration is now complete. Users can purchase and download your product instantly without any manual intervention.

**Next Steps:**
1. Test thoroughly with test keys
2. Complete KYC for live payments
3. Switch to live keys
4. Start accepting real payments! 💰
