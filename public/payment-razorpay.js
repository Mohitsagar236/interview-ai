// Razorpay Payment Integration for Interview AI
// Automated payment processing - No manual verification needed

// Configuration
const PAYMENT_CONFIG = {
    apiBaseUrl: '/api', // Adjust based on your deployment
    
    // Pricing (in INR)
    prices: {
        basic: 499,      // ₹499
        plus: 999,       // ₹999
        advanced: 1699,  // ₹1,699
        windows: 999,    // ₹999
        mac: 999,        // ₹999
        subscription: 999  // ₹999/month
    }
};

// Get product type from URL
const urlParams = new URLSearchParams(window.location.search);
const productType = urlParams.get('product') || 'windows';

// Product configurations
const products = {
    credits: {
        name: 'Interview AI Credits',
        description: 'Purchase credits to unlock premium features',
        price: PAYMENT_CONFIG.prices.basic,
        icon: 'fa-coins',
        downloadUrl: null
    },
    basic: {
        name: 'Interview AI - Basic Plan',
        description: '3 Interview Credits',
        price: PAYMENT_CONFIG.prices.basic,
        icon: 'fa-star',
        downloadUrl: null
    },
    plus: {
        name: 'Interview AI - Plus Plan',
        description: '6 Interview Credits + 2 Free',
        price: PAYMENT_CONFIG.prices.plus,
        icon: 'fa-star',
        downloadUrl: null
    },
    advanced: {
        name: 'Interview AI - Advanced Plan',
        description: '9 Interview Credits + 6 Free',
        price: PAYMENT_CONFIG.prices.advanced,
        icon: 'fa-star',
        downloadUrl: null
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

const currentProduct = products[productType] || products.credits;

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    checkAuthentication();
    updateProductInfo();
    setupEventListeners();
    prefillUserData();
});

// Update UI with product info
function updateProductInfo() {
    document.getElementById('product-name').textContent = currentProduct.name;
    document.getElementById('product-description').textContent = currentProduct.description;
    document.getElementById('product-price').textContent = `₹${currentProduct.price.toLocaleString('en-IN')}`;
    document.getElementById('subtotal').textContent = `₹${currentProduct.price.toLocaleString('en-IN')}`;
    document.getElementById('total').textContent = `₹${currentProduct.price.toLocaleString('en-IN')}`;
    
    // Update icon
    const iconElement = document.querySelector('.order-icon');
    if (iconElement) {
        iconElement.className = `fab ${currentProduct.icon} order-icon`;
    }
}

// Check if user is authenticated
async function checkAuthentication() {
    // Check Supabase session if available
    if (window.supabase) {
        const { data: { session } } = await window.supabase.auth.getSession();
        if (session) {
            return; // User is authenticated
        }
    }
    
    // Fallback to localStorage check
    const userData = getUserData();
    
    if (!userData || !userData.authenticated) {
        // Not authenticated, redirect to auth page
        window.location.href = `auth.html?product=${productType}`;
        return;
    }
}

// Get user data from storage
function getUserData() {
    const localData = localStorage.getItem('interviewai_user');
    const sessionData = sessionStorage.getItem('interviewai_user');
    
    if (localData) {
        return JSON.parse(localData);
    }
    
    if (sessionData) {
        return JSON.parse(sessionData);
    }
    
    return null;
}

// Pre-fill user data in form
function prefillUserData() {
    const userData = getUserData();
    
    if (userData) {
        if (userData.email) {
            document.getElementById('email').value = userData.email;
        }
        if (userData.name) {
            document.getElementById('name').value = userData.name;
        }
        if (userData.phone) {
            document.getElementById('phone').value = userData.phone;
        }
    }
}

// Setup event listeners
function setupEventListeners() {
    const form = document.getElementById('payment-form');
    form.addEventListener('submit', handlePayment);
}

// Handle payment form submission
async function handlePayment(e) {
    e.preventDefault();
    
    const submitButton = document.getElementById('submit-button');
    const spinner = document.getElementById('spinner');
    const buttonText = document.getElementById('button-text');
    
    // Get form data
    const email = document.getElementById('email').value.trim();
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const termsAccepted = document.getElementById('terms').checked;
    
    // Validate
    if (!email || !name || !phone) {
        showMessage('Please fill in all required fields', 'error');
        return;
    }
    
    if (!termsAccepted) {
        showMessage('Please accept the terms of service', 'error');
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showMessage('Please enter a valid email address', 'error');
        return;
    }
    
    // Validate phone format
    const phoneRegex = /^[+]?[0-9]{10,13}$/;
    if (!phoneRegex.test(phone)) {
        showMessage('Please enter a valid phone number', 'error');
        return;
    }
    
    // Disable button and show loading
    submitButton.disabled = true;
    spinner.classList.remove('hidden');
    buttonText.textContent = 'Processing...';
    
    try {
        // Create Razorpay order
        const orderData = await createRazorpayOrder({
            amount: currentProduct.price,
            currency: 'INR',
            productType: productType,
            email: email,
            name: name,
            phone: phone
        });
        
        if (!orderData.success) {
            throw new Error(orderData.error || 'Failed to create order');
        }
        
        // Open Razorpay checkout
        openRazorpayCheckout(orderData, { email, name, phone });
        
    } catch (error) {
        console.error('Payment error:', error);
        showMessage(error.message || 'Payment failed. Please try again.', 'error');
        
        // Re-enable button
        submitButton.disabled = false;
        spinner.classList.add('hidden');
        buttonText.textContent = 'Proceed to Payment';
    }
}

// Create Razorpay order
async function createRazorpayOrder(orderData) {
    try {
        const response = await fetch(`${PAYMENT_CONFIG.apiBaseUrl}/create-razorpay-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(orderData)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to create order');
        }
        
        return data;
        
    } catch (error) {
        console.error('Error creating order:', error);
        throw error;
    }
}

// Open Razorpay checkout
function openRazorpayCheckout(orderData, userDetails) {
    const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Interview AI',
        description: currentProduct.name,
        image: 'images/app-icon.svg',
        order_id: orderData.orderId,
        prefill: {
            name: userDetails.name,
            email: userDetails.email,
            contact: userDetails.phone
        },
        theme: {
            color: '#10b981'
        },
        handler: function(response) {
            // Payment successful
            handlePaymentSuccess(response, userDetails);
        },
        modal: {
            ondismiss: function() {
                // Payment cancelled
                handlePaymentCancelled();
            }
        }
    };
    
    const razorpay = new Razorpay(options);
    razorpay.open();
}

// Handle payment success
async function handlePaymentSuccess(response, userDetails) {
    const submitButton = document.getElementById('submit-button');
    const spinner = document.getElementById('spinner');
    const buttonText = document.getElementById('button-text');
    
    buttonText.textContent = 'Verifying Payment...';
    
    try {
        // Verify payment on server
        const verificationResponse = await fetch(`${PAYMENT_CONFIG.apiBaseUrl}/verify-razorpay-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                email: userDetails.email,
                name: userDetails.name,
                productType: productType
            })
        });
        
        const verificationData = await verificationResponse.json();
        
        if (verificationData.success) {
            // Payment verified successfully
            showSuccessModal(userDetails.email, verificationData.downloadUrl);
        } else {
            throw new Error(verificationData.error || 'Payment verification failed');
        }
        
    } catch (error) {
        console.error('Verification error:', error);
        showMessage('Payment successful but verification failed. Please contact support with payment ID: ' + response.razorpay_payment_id, 'warning');
    } finally {
        // Re-enable button
        submitButton.disabled = false;
        spinner.classList.add('hidden');
        buttonText.textContent = 'Proceed to Payment';
    }
}

// Handle payment cancelled
function handlePaymentCancelled() {
    const submitButton = document.getElementById('submit-button');
    const spinner = document.getElementById('spinner');
    const buttonText = document.getElementById('button-text');
    
    // Re-enable button
    submitButton.disabled = false;
    spinner.classList.add('hidden');
    buttonText.textContent = 'Proceed to Payment';
    
    showMessage('Payment cancelled. You can try again when ready.', 'info');
}

// Show success modal
function showSuccessModal(email, downloadUrl) {
    const modal = document.getElementById('success-modal');
    const userEmailSpan = document.getElementById('user-email');
    const downloadButton = document.getElementById('download-now');
    const closeButton = document.getElementById('close-modal');
    
    userEmailSpan.textContent = email;
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Download button handler
    downloadButton.onclick = function() {
        window.location.href = downloadUrl;
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
    };
    
    // Close button handler
    closeButton.onclick = function() {
        modal.classList.add('hidden');
        window.location.href = 'index.html';
    };
    
    // Auto-download after 2 seconds
    setTimeout(() => {
        if (downloadUrl) {
            window.location.href = downloadUrl;
        }
    }, 2000);
}

// Show message
function showMessage(message, type = 'info') {
    const messageDiv = document.getElementById('payment-message');
    messageDiv.textContent = message;
    messageDiv.className = `payment-message ${type}`;
    messageDiv.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 5000);
}

// Add styles for payment message
const style = document.createElement('style');
style.textContent = `
    .payment-message {
        padding: 15px;
        border-radius: 8px;
        margin-top: 20px;
        font-weight: 500;
    }
    
    .payment-message.error {
        background-color: #fee;
        color: #c33;
        border: 1px solid #fcc;
    }
    
    .payment-message.success {
        background-color: #efe;
        color: #3c3;
        border: 1px solid #cfc;
    }
    
    .payment-message.warning {
        background-color: #ffc;
        color: #c93;
        border: 1px solid #fc9;
    }
    
    .payment-message.info {
        background-color: #def;
        color: #369;
        border: 1px solid #bcf;
    }
    
    .payment-methods-info {
        background: #f8f9fa;
        padding: 20px;
        border-radius: 12px;
        margin: 20px 0;
        text-align: center;
    }
    
    .payment-methods-info h3 {
        margin: 0 0 15px 0;
        font-size: 16px;
        color: #333;
    }
    
    .payment-method-icons {
        display: flex;
        justify-content: space-around;
        align-items: center;
        gap: 15px;
        margin: 15px 0;
    }
    
    .method-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    }
    
    .method-item i {
        font-size: 32px;
        color: #10b981;
    }
    
    .method-item span {
        font-size: 12px;
        font-weight: 500;
        color: #666;
    }
    
    .payment-apps-text {
        margin: 10px 0 0 0;
        color: #666;
    }
    
    .razorpay-badge {
        text-align: center;
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid #eee;
    }
    
    .razorpay-badge small {
        display: block;
        color: #999;
        font-size: 11px;
        margin-bottom: 4px;
    }
    
    .razorpay-badge strong {
        color: #10b981;
        font-size: 14px;
        letter-spacing: 1px;
    }
    
    .hidden {
        display: none !important;
    }
    
    .spinner {
        border: 2px solid #f3f3f3;
        border-top: 2px solid #10b981;
        border-radius: 50%;
        width: 16px;
        height: 16px;
        animation: spin 1s linear infinite;
        display: inline-block;
        margin-left: 10px;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);
