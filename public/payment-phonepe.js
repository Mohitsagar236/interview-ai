// PhonePe Payment Integration for Interview AI
// Automated payment processing with PhonePe gateway

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
    },
    
    // Coupon codes
    coupons: {
        'WELCOME10': { discount: 10, type: 'percentage' },  // 10% off
        'SAVE20': { discount: 20, type: 'percentage' },      // 20% off
        'FIRSTBUY': { discount: 15, type: 'percentage' },    // 15% off
        'FLAT100': { discount: 100, type: 'fixed' },         // ₹100 off
        'FLAT200': { discount: 200, type: 'fixed' },         // ₹200 off
        'STUDENT': { discount: 100, type: 'percentage', restrictTo: ['credits', 'basic', 'plus', 'advanced'] }  // 100% off on credits only (STUDENT coupon)
    }
};

// Coupon state
let appliedCoupon = null;
let discountAmount = 0;

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
        downloadUrl: 'https://pub-bd0f8fce43ae498088abfcbd6d669f15.r2.dev/releases/v0.1.0/Interview-AI-Setup-0.1.0-x64.exe'
    },
    mac: {
        name: 'Interview AI Assistant - macOS',
        description: '100% Private and Undetectable Desktop Application',
        price: PAYMENT_CONFIG.prices.mac,
        icon: 'fa-apple',
        downloadUrl: 'https://pub-bd0f8fce43ae498088abfcbd6d669f15.r2.dev/releases/v0.1.0/Interview-AI-0.1.0.dmg'
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
    checkUrlParams();
    checkAuthentication();
    updateProductInfo();
    setupEventListeners();
    prefillUserData();
});

// Check URL parameters for payment status
function checkUrlParams() {
    const status = urlParams.get('status');
    const error = urlParams.get('error');
    const transactionId = urlParams.get('transactionId');

    if (status === 'failed' && error) {
        showMessage(`Payment failed: ${decodeURIComponent(error)}`, 'error');
    } else if (status === 'pending' && transactionId) {
        showMessage('Payment is pending. Please wait or try again.', 'warning');
    }
}

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
    
    const applyCouponBtn = document.getElementById('apply-coupon-btn');
    if (applyCouponBtn) {
        applyCouponBtn.addEventListener('click', applyCoupon);
    }
}

// Apply coupon code
function applyCoupon() {
    const couponInput = document.getElementById('coupon-code');
    const couponCode = couponInput.value.trim().toUpperCase();
    const couponMessage = document.getElementById('coupon-message');
    
    if (!couponCode) {
        couponMessage.textContent = 'Please enter a coupon code';
        couponMessage.className = 'coupon-message error';
        return;
    }
    
    const coupon = PAYMENT_CONFIG.coupons[couponCode];
    
    if (!coupon) {
        couponMessage.textContent = 'Invalid coupon code';
        couponMessage.className = 'coupon-message error';
        return;
    }
    
    // Check if coupon is restricted to certain products
    if (coupon.restrictTo && !coupon.restrictTo.includes(productType)) {
        couponMessage.textContent = 'This coupon is only valid for credit purchases';
        couponMessage.className = 'coupon-message error';
        return;
    }
    
    // Calculate discount
    const originalPrice = currentProduct.price;
    
    if (coupon.type === 'percentage') {
        discountAmount = Math.round((originalPrice * coupon.discount) / 100);
    } else if (coupon.type === 'fixed') {
        discountAmount = coupon.discount;
    }
    
    // Ensure discount doesn't exceed price
    if (discountAmount > originalPrice) {
        discountAmount = originalPrice;
    }
    
    appliedCoupon = couponCode;
    
    // Update UI
    updatePriceDisplay();
    
    // Show success message
    const savingsText = discountAmount === originalPrice ? 'FREE!' : `You saved ₹${discountAmount}`;
    couponMessage.textContent = `✓ Coupon applied! ${savingsText}`;
    couponMessage.className = 'coupon-message success';
    
    // Disable input and button
    couponInput.disabled = true;
    document.getElementById('apply-coupon-btn').disabled = true;
}

// Update price display with discount
function updatePriceDisplay() {
    const originalPrice = currentProduct.price;
    const finalPrice = originalPrice - discountAmount;
    
    // Update subtotal
    document.getElementById('subtotal').textContent = `₹${originalPrice.toLocaleString('en-IN')}`;
    
    // Show/hide discount row
    const discountRow = document.getElementById('discount-row');
    if (discountAmount > 0) {
        discountRow.style.display = 'flex';
        document.getElementById('discount-code').textContent = `(${appliedCoupon})`;
        document.getElementById('discount-amount').textContent = `-₹${discountAmount.toLocaleString('en-IN')}`;
    } else {
        discountRow.style.display = 'none';
    }
    
    // Update total
    document.getElementById('total').textContent = `₹${finalPrice.toLocaleString('en-IN')}`;
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
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        showMessage('Please enter a valid phone number', 'error');
        return;
    }
    
    // Disable button and show loading
    submitButton.disabled = true;
    spinner.classList.remove('hidden');
    buttonText.textContent = 'Processing...';
    
    try {
        // Calculate final price with discount
        const finalPrice = currentProduct.price - discountAmount;
        
        // Check if order is free (100% discount)
        if (finalPrice === 0) {
            // Handle free order - no payment required
            buttonText.textContent = 'Processing Free Order...';
            
            // Grant credits directly for free orders
            const result = await grantFreeCredits({
                email: email,
                name: name,
                phone: phone,
                productType: productType,
                couponCode: appliedCoupon
            });
            
            if (result.success) {
                showMessage('🎉 Congratulations! Your credits have been granted for FREE!', 'success');
                
                // Show success and redirect
                setTimeout(() => {
                    window.location.href = 'profile.html?free=true';
                }, 2000);
            } else {
                // Check if user needs to sign up
                if (result.requiresAuth) {
                    showMessage('Please sign up or login first to claim your free credits!', 'error');
                    setTimeout(() => {
                        window.location.href = `auth.html?redirect=${encodeURIComponent(window.location.href)}`;
                    }, 2000);
                } else {
                    throw new Error(result.error || 'Failed to grant free credits');
                }
            }
            
            return;
        }
        
        // Store user data for verification after redirect
        localStorage.setItem('phonepe_pending_payment', JSON.stringify({
            email,
            name,
            phone,
            productType,
            amount: finalPrice,
            couponCode: appliedCoupon,
            discount: discountAmount,
            timestamp: Date.now()
        }));
        
        // Create PhonePe order
        buttonText.textContent = 'Redirecting to PhonePe...';
        
        const orderData = await createPhonePeOrder({
            amount: finalPrice,
            currency: 'INR',
            productType: productType,
            email: email,
            name: name,
            phone: phone,
            couponCode: appliedCoupon,
            discount: discountAmount
        });
        
        if (!orderData.success) {
            throw new Error(orderData.error || 'Failed to create order');
        }
        
        // Redirect to PhonePe payment page
        if (orderData.paymentUrl) {
            window.location.href = orderData.paymentUrl;
        } else {
            throw new Error('Payment URL not received');
        }
        
    } catch (error) {
        console.error('Payment error:', error);
        showMessage(error.message || 'Payment failed. Please try again.', 'error');
        
        // Re-enable button
        submitButton.disabled = false;
        spinner.classList.add('hidden');
        buttonText.textContent = 'Proceed to Payment';
    }
}

// Create PhonePe order
async function createPhonePeOrder(orderData) {
    try {
        const response = await fetch(`${PAYMENT_CONFIG.apiBaseUrl}/create-phonepe-order`, {
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

// Grant free credits (for 100% discount coupons like STUDENT)
async function grantFreeCredits(userData) {
    try {
        const response = await fetch(`${PAYMENT_CONFIG.apiBaseUrl}/grant-free-credits`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to grant free credits');
        }
        
        return data;
        
    } catch (error) {
        console.error('Error granting free credits:', error);
        throw error;
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
    
    showMessage('Payment cancelled. Please try again when ready.', 'warning');
}

// Show success modal
function showSuccessModal(email, downloadUrl) {
    const modal = document.getElementById('success-modal');
    const userEmailSpan = document.getElementById('user-email');
    const downloadButton = document.getElementById('download-now');
    
    userEmailSpan.textContent = email;
    modal.classList.remove('hidden');
    
    // Setup download button
    downloadButton.addEventListener('click', () => {
        if (downloadUrl) {
            window.location.href = downloadUrl;
        } else {
            // For credit purchases, redirect to profile
            window.location.href = 'profile.html';
        }
    });
    
    // Setup close button
    document.getElementById('close-modal').addEventListener('click', () => {
        modal.classList.add('hidden');
        // Redirect to profile or home
        window.location.href = downloadUrl ? 'index.html' : 'profile.html';
    });
    
    // Auto-start download for software products
    if (downloadUrl && currentProduct.downloadUrl) {
        setTimeout(() => {
            window.location.href = downloadUrl;
        }, 1500);
    }
}

// Show message
function showMessage(text, type = 'info') {
    const messageDiv = document.getElementById('payment-message');
    
    messageDiv.className = `message ${type}`;
    messageDiv.innerHTML = `
        <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : type === 'success' ? 'fa-check-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
        <span>${text}</span>
    `;
    messageDiv.classList.remove('hidden');
    
    // Auto-hide after 5 seconds for non-error messages
    if (type !== 'error') {
        setTimeout(() => {
            messageDiv.classList.add('hidden');
        }, 5000);
    }
    
    // Scroll to message
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Format currency
function formatCurrency(amount) {
    return `₹${amount.toLocaleString('en-IN')}`;
}
