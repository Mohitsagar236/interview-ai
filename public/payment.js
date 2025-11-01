// UPI Payment System for Interview AI
// No Stripe - Direct UPI/Bank Transfer

// Configuration - UPDATE THESE WITH YOUR DETAILS
const PAYMENT_CONFIG = {
    upiId: 'yourname@paytm',  // 🔴 UPDATE: Your UPI ID
    upiName: 'Your Name',      // 🔴 UPDATE: Your name for UPI
    
    // Bank Details
    bankName: 'Interview AI Solutions',
    accountNumber: '1234567890',  // 🔴 UPDATE: Your account number
    ifscCode: 'SBIN0001234',      // 🔴 UPDATE: Your IFSC code
    bankBranch: 'State Bank of India',  // 🔴 UPDATE: Your bank name
    
    // Pricing (in INR)
    prices: {
        windows: 3999,  // ₹3,999
        mac: 3999,      // ₹3,999
        subscription: 2999  // ₹2,999/month
    },
    
    // Your admin email to receive payment notifications
    adminEmail: 'admin@yourdomain.com'  // 🔴 UPDATE: Your email
};

// Get product type from URL
const urlParams = new URLSearchParams(window.location.search);
const productType = urlParams.get('product') || 'windows';

// Product configurations
const products = {
    windows: {
        name: 'Interview AI Assistant - Windows',
        description: 'Desktop application with premium features',
        price: PAYMENT_CONFIG.prices.windows,
        icon: 'fa-windows',
        downloadUrl: 'downloads/Interview AI Assistant Setup 0.1.0.exe'
    },
    mac: {
        name: 'Interview AI Assistant - macOS',
        description: 'Optimized for Apple Silicon and Intel Macs',
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
    // In production, this would call your backend API
    // For now, we'll simulate the process
    
    console.log('Payment verification data:', paymentData);
    
    try {
        // PRODUCTION: Uncomment this to use real API
        /*
        const response = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(paymentData),
        });
        
        const result = await response.json();
        
        if (result.success) {
            handlePaymentSubmitted(paymentData.email);
        } else {
            throw new Error(result.message || 'Verification failed');
        }
        */
        
        // DEMO: Simulate API call
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Store payment data in localStorage
        const paymentInfo = {
            ...paymentData,
            date: new Date().toISOString(),
            status: 'pending',
            downloadUrl: currentProduct.downloadUrl
        };
        
        localStorage.setItem('payment_pending', JSON.stringify(paymentInfo));
        
        // Show success
        handlePaymentSubmitted(paymentData.email);
        
    } catch (error) {
        throw error;
    }
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
