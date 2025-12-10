# API Reference

Documentation for the Interview AI serverless API endpoints.

## Base URL

- **Production:** `https://interviewai.space/api`
- **Development:** `http://localhost:3000/api`

---

## Authentication

Most endpoints require either:
- **User Session:** Supabase auth token
- **Activation Code:** For desktop app operations

---

## Endpoints

### Activation

#### Generate Activation Code
```http
POST /api/generate-activation-code
```

**Request:**
```json
{
  "user_id": "uuid",
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "code": "A1B2-C3D4-E5F6-G7H8",
  "credits": {
    "total": 8,
    "used": 0
  }
}
```

---

#### Activate Desktop App
```http
POST /api/activate-desktop
```

**Request:**
```json
{
  "code": "A1B2-C3D4-E5F6-G7H8",
  "device_id": "unique-device-id"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "email": "user@example.com",
    "name": "John Doe"
  },
  "credits": {
    "total": 8,
    "used": 2,
    "remaining": 6
  }
}
```

---

### Credits

#### Get Credits by Code
```http
GET /api/get-credits-by-code?code=A1B2-C3D4-E5F6-G7H8
```

**Response:**
```json
{
  "success": true,
  "credits_total": 8,
  "credits_used": 2,
  "plan_type": "plus"
}
```

---

#### Update Credits
```http
POST /api/update-credits-by-code
```

**Request:**
```json
{
  "code": "A1B2-C3D4-E5F6-G7H8",
  "credits_used": 1.5
}
```

**Response:**
```json
{
  "success": true,
  "credits_total": 8,
  "credits_used": 3.5
}
```

---

### Payment (Razorpay)

#### Create Order
```http
POST /api/create-razorpay-order
```

**Request:**
```json
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
  "currency": "INR",
  "key": "rzp_live_xxxxx"
}
```

---

#### Verify Payment
```http
POST /api/verify-razorpay-payment
```

**Request:**
```json
{
  "razorpay_order_id": "order_xxxxx",
  "razorpay_payment_id": "pay_xxxxx",
  "razorpay_signature": "xxxxx",
  "email": "user@example.com",
  "product": "basic"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment verified",
  "credits_added": 3
}
```

---

#### Webhook (Razorpay → Server)
```http
POST /api/razorpay-webhook
```

**Headers:**
```
X-Razorpay-Signature: xxxxx
```

**Body:** Razorpay event payload

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_CODE` | Activation code not found |
| `CODE_EXPIRED` | Activation code has expired |
| `CODE_INACTIVE` | Code has been deactivated |
| `PAYMENT_FAILED` | Payment verification failed |
| `INSUFFICIENT_CREDITS` | Not enough credits |
| `INTERNAL_ERROR` | Server error |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Payment creation | 10/minute |
| Code activation | 5/minute |
| Credit updates | 30/minute |

---

## WebSocket API

The Python backend exposes a WebSocket API for real-time communication.

### Connection
```javascript
const ws = new WebSocket('wss://your-server.com/ui');
```

### Message Types

#### Capture Request
```json
{
  "type": "capture",
  "image": "base64-encoded-screenshot"
}
```

#### AI Response (Streaming)
```json
{
  "type": "response",
  "content": "partial response text",
  "done": false
}
```

#### Transcription
```json
{
  "type": "transcription",
  "text": "transcribed speech"
}
```
