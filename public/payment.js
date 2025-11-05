// UPI Payment System for Interview AI
// No Stripe - Direct UPI/Bank Transfer

// Configuration - UPDATE THESE WITH YOUR DETAILS
const PAYMENT_CONFIG = {
    upiId: 'cp8137108@oksbi',  // 🔴 UPDATE: Your UPI ID
    upiName: 'mohitsagar',      // 🔴 UPDATE: Your name for UPI
    
    // Bank Details
    bankName: 'mohitsagar',
    accountNumber: '39716154031',  // 🔴 UPDATE: Your account number
    ifscCode: 'SBIN00018563',      // 🔴 UPDATE: Your IFSC code
    bankBranch: 'State Bank of India',  // 🔴 UPDATE: Your bank name
    
    // Pricing (in INR)
    prices: {
        basic: 499,      // ₹499
        plus: 999,       // ₹999
        advanced: 1699,  // ₹1,699
        windows: 999,    // ₹999 (default)
        mac: 999,        // ₹999 (default)
        subscription: 999  // ₹999/month
    },
    
    // Your admin email to receive payment notifications
    adminEmail: 'admin@yourdomain.com'  // 🔴 UPDATE: Your email
};

// Get product type from URL
const urlParams = new URLSearchParams(window.location.search);
const productType = urlParams.get('product') || 'windows';

// Product configurations
const products = {
    basic: {
        name: 'Interview AI - Basic Plan',
        description: '3 Interview Credits',
        price: PAYMENT_CONFIG.prices.basic,
        icon: 'fa-star',
        downloadUrl: 'downloads/Interview AI Assistant Setup 0.1.0.exe'
    },
    plus: {
        name: 'Interview AI - Plus Plan',
        description: '6 Interview Credits + 2 Free',
        price: PAYMENT_CONFIG.prices.plus,
        icon: 'fa-star',
        downloadUrl: 'downloads/Interview AI Assistant Setup 0.1.0.exe'
    },
    advanced: {
        name: 'Interview AI - Advanced Plan',
        description: '9 Interview Credits + 6 Free',
        price: PAYMENT_CONFIG.prices.advanced,
        icon: 'fa-star',
        downloadUrl: 'downloads/Interview AI Assistant Setup 0.1.0.exe'
    },
    windows: {
        name: 'Interview AI Assistant - Windows',
        description: '100% Private and Undetectable Desktop Application',
        price: PAYMENT_CONFIG.prices.windows,
        icon: 'fa-windows',
        downloadUrl: 'downloads/Interview AI Assistant Setup 0.1.0.exe'
    },
    mac: {
        name: 'Interview AI Assistant - macOS',
        description: '100% Private and Undetectable Desktop Application',
        price: PAYMENT_CONFIG.prices.mac,
        icon: 'fa-apple',
        downloadUrl: 'downloads/Interview AI Assistant-0.1.0.dmg'
    },
    subscription: {
        name: 'Interview AI Pro - Monthly',
        description: 'Premium subscription with all features',
        price: PAYMENT_CONFIG.prices.subscription,
        icon: 'fa-crown',
        downloadUrl: null
    }
};

const currentProduct = products[productType] || products.windows;

// Update UI with product info
function updateProductInfo() {
    document.getElementById('product-name').textContent = currentProduct.name;
    document.getElementById('product-description').textContent = currentProduct.description;
    document.getElementById('product-price').textContent = `₹${currentProduct.price.toLocaleString('en-IN')}`;
    document.getElementById('subtotal').textContent = `₹${currentProduct.price.toLocaleString('en-IN')}`;
    document.getElementById('total').textContent = `₹${currentProduct.price.toLocaleString('en-IN')}`;
    document.getElementById('button-text').textContent = 'Verify Payment';
    
    // Update amount displays
    document.getElementById('amount-inr').textContent = `₹${currentProduct.price.toLocaleString('en-IN')}`;
    document.getElementById('amount-bank').textContent = `₹${currentProduct.price.toLocaleString('en-IN')}`;
    
    // Update icon
    const iconElement = document.querySelector('.order-icon');
    iconElement.className = `fab ${currentProduct.icon} order-icon`;
    
    // Update UPI ID
    document.getElementById('upi-id').value = PAYMENT_CONFIG.upiId;
    
    // Update bank details
    document.getElementById('bank-name').textContent = PAYMENT_CONFIG.bankName;
    document.getElementById('account-number').textContent = PAYMENT_CONFIG.accountNumber;
    document.getElementById('ifsc-code').textContent = PAYMENT_CONFIG.ifscCode;
    document.getElementById('bank-branch').textContent = PAYMENT_CONFIG.bankBranch;
}

// Generate UPI deep link and QR code
function generateUPIPayment() {
    const amount = currentProduct.price;
    const note = `Payment for ${currentProduct.name}`;
    
    // UPI URL format: upi://pay?pa=UPI_ID&pn=NAME&am=AMOUNT&cu=INR&tn=NOTE
    const upiUrl = `upi://pay?pa=${PAYMENT_CONFIG.upiId}&pn=${encodeURIComponent(PAYMENT_CONFIG.upiName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;
    
    // Generate QR code
    generateQRCode(upiUrl);
    
    return upiUrl;
}

// Generate QR Code using QRCode.js library
function generateQRCode(data) {
    const qrContainer = document.getElementById('qr-code');
    qrContainer.innerHTML = ''; // Clear existing
    
    // Using a simple QR code generator (you can use any library)
    // For now, we'll use a free API
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data)}`;
    
    const img = document.createElement('img');
    img.src = qrCodeUrl;
    img.alt = 'UPI QR Code';
    img.style.width = '100%';
    img.style.height = '100%';
    
    qrContainer.appendChild(img);
}

// Payment method toggle
const paymentOptions = document.querySelectorAll('.payment-option');
const paymentSections = document.querySelectorAll('.payment-section');

paymentOptions.forEach(option => {
    option.addEventListener('click', () => {
        // Remove active class from all options
        paymentOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        
        // Show corresponding section
        const method = option.dataset.method;
        paymentSections.forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(`${method}-section`).classList.add('active');
    });
});

// Copy UPI ID
document.getElementById('copy-upi').addEventListener('click', () => {
    const upiId = document.getElementById('upi-id').value;
    navigator.clipboard.writeText(upiId).then(() => {
        showMessage('UPI ID copied to clipboard!', 'success');
    });
});

// Copy bank details
document.querySelectorAll('.btn-copy-inline').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const elementId = e.currentTarget.dataset.copy;
        const text = document.getElementById(elementId).textContent;
        navigator.clipboard.writeText(text).then(() => {
            showMessage('Copied to clipboard!', 'success');
        });
    });
});

// Handle form submission
const form = document.getElementById('payment-form');
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const email = document.getElementById('email').value;
    const name = document.getElementById('name').value;
    const phone = document.getElementById('phone').value;
    const termsAccepted = document.getElementById('terms').checked;
    
    // Get transaction ID based on payment method
    const activeMethod = document.querySelector('.payment-option.active').dataset.method;
    const transactionId = activeMethod === 'upi' 
        ? document.getElementById('transaction-id').value
        : document.getElementById('transaction-ref').value;
    
    if (!termsAccepted) {
        showMessage('Please confirm that you have completed the payment', 'error');
        return;
    }
    
    if (!transactionId) {
        showMessage('Please enter your transaction ID/reference number', 'error');
        return;
    }
    
    setLoading(true);
    
    try {
        // Submit payment verification request
        await verifyPayment({
            email,
            name,
            phone,
            transactionId,
            paymentMethod: activeMethod,
            product: currentProduct.name,
            amount: currentProduct.price,
            productType: productType
        });
        
    } catch (error) {
        console.error('Payment verification error:', error);
        showMessage('Failed to submit payment verification. Please try again.', 'error');
        setLoading(false);
    }
});

// Verify payment (send to backend for verification)
async function verifyPayment(paymentData) {
    console.log('Payment verification data:', paymentData);
    
    try {
        // Call automated verification API
        const response = await fetch('/api/verify-payment-auto', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(paymentData),
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Verification failed');
        }
        
        // If payment verified immediately (webhook received)
        if (result.verified) {
            handlePaymentVerified(result, paymentData.email);
            return;
        }
        
        // Payment pending - start polling for verification
        const paymentId = result.payment_id;
        handlePaymentPending(paymentId, paymentData.email);
        
        // Start polling for payment status
        startPaymentPolling(paymentId, paymentData.email);
        
    } catch (error) {
        throw error;
    }
}

// Start polling for payment verification
let pollInterval = null;
let pollAttempts = 0;
const MAX_POLL_ATTEMPTS = 60; // Poll for 2 minutes (every 2 seconds)

function startPaymentPolling(paymentId, email) {
    pollAttempts = 0;
    
    // Update UI to show polling status
    updatePollingStatus('Verifying payment...', 'checking');
    
    pollInterval = setInterval(async () => {
        pollAttempts++;
        
        try {
            const response = await fetch(`/api/verify-payment-auto?payment_id=${paymentId}`);
            const result = await response.json();
            
            if (result.success && result.verified) {
                // Payment verified!
                clearInterval(pollInterval);
                handlePaymentVerified(result, email);
            } else if (pollAttempts >= MAX_POLL_ATTEMPTS) {
                // Timeout - show manual verification message
                clearInterval(pollInterval);
                handlePaymentTimeout(email);
            } else {
                // Update progress
                const progress = Math.min(95, (pollAttempts / MAX_POLL_ATTEMPTS) * 100);
                updatePollingStatus(`Verifying payment... (${Math.floor(progress)}%)`, 'checking');
            }
        } catch (error) {
            console.error('Polling error:', error);
            
            if (pollAttempts >= MAX_POLL_ATTEMPTS) {
                clearInterval(pollInterval);
                handlePaymentTimeout(email);
            }
        }
    }, 2000); // Poll every 2 seconds
}

// Handle immediate payment verification
function handlePaymentVerified(result, email) {
    setLoading(false);
    updatePollingStatus('Payment verified! 🎉', 'success');
    
    // Update modal with download link
    document.getElementById('user-email').textContent = email;
    
    const modal = document.getElementById('success-modal');
    const modalContent = modal.querySelector('.modal-content');
    
    modalContent.querySelector('h2').textContent = 'Payment Verified! 🎉';
    modalContent.querySelector('p').textContent = 'Your payment has been confirmed. Download your app now!';
    modalContent.querySelector('.download-info').textContent = `Download link expires in 24 hours.`;
    
    // Store download info
    const downloadInfo = {
        download_token: result.download_token,
        download_url: result.download_url,
        payment_id: result.payment_id,
        verified_at: new Date().toISOString()
    };
    localStorage.setItem('download_info', JSON.stringify(downloadInfo));
    
    // Update button to trigger download
    const downloadBtn = document.getElementById('download-now');
    downloadBtn.textContent = 'Download Now';
    downloadBtn.onclick = () => {
        window.location.href = result.download_url;
        
        // Also send email confirmation
        setTimeout(() => {
            showMessage('Download started! Check your email for the download link.', 'success');
        }, 1000);
    };
    
    modal.classList.remove('hidden');
}

// Handle payment pending verification
function handlePaymentPending(paymentId, email) {
    setLoading(false);
    
    document.getElementById('user-email').textContent = email;
    
    // Show polling modal
    const modal = document.getElementById('success-modal');
    const modalContent = modal.querySelector('.modal-content');
    
    modalContent.querySelector('h2').textContent = 'Verifying Payment...';
    modalContent.querySelector('p').innerHTML = '<div id="polling-status" class="polling-status"></div>';
    modalContent.querySelector('.download-info').textContent = 'Please wait while we verify your payment. This usually takes 10-30 seconds.';
    
    // Hide download button initially
    document.getElementById('download-now').style.display = 'none';
    
    modal.classList.remove('hidden');
}

// Update polling status in modal
function updatePollingStatus(message, status) {
    const statusElement = document.getElementById('polling-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `polling-status ${status}`;
    }
}

// Handle payment verification timeout
function handlePaymentTimeout(email) {
    updatePollingStatus('Verification taking longer than expected', 'warning');
    
    const modal = document.getElementById('success-modal');
    const modalContent = modal.querySelector('.modal-content');
    
    modalContent.querySelector('h2').textContent = 'Payment Submitted';
    modalContent.querySelector('p').innerHTML = `
        <div class="polling-status warning">
            Verification is taking longer than expected. This can happen during high traffic.
        </div>
    `;
    modalContent.querySelector('.download-info').innerHTML = `
        We'll send the download link to <strong>${email}</strong> within 5-10 minutes once verified.<br>
        <small>Check your email inbox and spam folder.</small>
    `;
    
    // Show OK button
    const downloadBtn = document.getElementById('download-now');
    downloadBtn.style.display = 'block';
    downloadBtn.textContent = 'Okay, Got It';
    downloadBtn.onclick = () => {
        window.location.href = 'index.html';
    };
}

// Handle payment submission success
function handlePaymentSubmitted(email) {
    setLoading(false);
    
    // Update modal
    document.getElementById('user-email').textContent = email;
    
    // Show success modal with pending message
    const modal = document.getElementById('success-modal');
    const modalContent = modal.querySelector('.modal-content');
    
    // Update modal text for pending verification
    modalContent.querySelector('h2').textContent = 'Payment Submitted!';
    modalContent.querySelector('p').textContent = 'Your payment is being verified. This usually takes 5-10 minutes.';
    modalContent.querySelector('.download-info').textContent = `We'll send the download link to ${email} once payment is confirmed.`;
    
    // Update button text
    document.getElementById('download-now').textContent = 'Okay, Got it';
    
    modal.classList.remove('hidden');
}

// Download handler (modified for pending state)
document.getElementById('download-now').addEventListener('click', () => {
    const paymentInfo = localStorage.getItem('payment_pending');
    
    if (paymentInfo) {
        showMessage('Download link will be sent to your email after verification', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
    }
});

// Close modal
document.getElementById('close-modal').addEventListener('click', () => {
    window.location.href = 'index.html';
});

// Show loading state
function setLoading(isLoading) {
    const submitButton = document.getElementById('submit-button');
    const spinner = document.getElementById('spinner');
    const buttonText = document.getElementById('button-text');
    
    if (isLoading) {
        submitButton.disabled = true;
        spinner.classList.remove('hidden');
        buttonText.textContent = 'Verifying...';
    } else {
        submitButton.disabled = false;
        spinner.classList.add('hidden');
        buttonText.textContent = 'Verify Payment';
    }
}

// Show message
function showMessage(message, type = 'error') {
    const messageElement = document.getElementById('payment-message');
    messageElement.textContent = message;
    messageElement.className = type;
    messageElement.classList.remove('hidden');
    
    setTimeout(() => {
        messageElement.classList.add('hidden');
    }, 5000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    updateProductInfo();
    generateUPIPayment();
    
    console.log('UPI Payment System Ready');
    console.log('Configuration:', {
        upiId: PAYMENT_CONFIG.upiId,
        product: currentProduct.name,
        amount: `₹${currentProduct.price}`
    });
});
