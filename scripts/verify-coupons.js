const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'payment-razorpay.js');
const content = fs.readFileSync(filePath, 'utf8');

function findCoupon(name) {
  const re = new RegExp("'" + name + "'\\s*:\\s*\\{\\s*discount\\s*:\\s*([0-9]+)\\s*,\\s*type\\s*:\\s*'([a-zA-Z]+)'", 'm');
  const m = content.match(re);
  if (!m) return null;
  return { discount: Number(m[1]), type: m[2] };
}

const coupon = findCoupon('FLAT498');
if (!coupon) {
  console.error('FLAT498 not found in payment-razorpay.js');
  process.exitCode = 1;
} else if (coupon.discount !== 498 || coupon.type !== 'fixed') {
  console.error('FLAT498 has unexpected properties:', coupon);
  process.exitCode = 1;
} else {
  console.log('OK: FLAT498 found and correct:', coupon);
  process.exitCode = 0;
}
