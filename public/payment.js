// Payment Processing with Stripe
// Replace with your actual Stripe publishable key
const STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_STRIPE_KEY_HERE';

// Get product type from URL parameter
const urlParams = new URLSearchParams(window.location.search);
const productType = urlParams.get('product') || 'windows';

// Product configurations
const products = {
    windows: {
        name: 'Interview AI Assistant - Windows',
        description: 'Desktop application with premium features',
        price: 49.99,
        icon: 'fa-windows',
        downloadUrl: 'downloads/Interview AI Assistant Setup 0.1.0.exe'
    },
    mac: {
        name: 'Interview AI Assistant - macOS',
        description: 'Optimized for Apple Silicon and Intel Macs',
        price: 49.99,
        icon: 'fa-apple',
        downloadUrl: 'downloads/Interview AI Assistant-0.1.0.dmg'
    },
    subscription: {
        name: 'Interview AI Pro - Monthly',
        description: 'Premium subscription with all features',
        price: 29.99,
        icon: 'fa-crown',
        downloadUrl: null // Subscription doesn't have direct download
    }
};

// Initialize Stripe
let stripe, elements, cardElement;

// Get current product
const currentProduct = products[productType] || products.windows;

// Update UI with product info
function updateProductInfo() {
    document.getElementById('product-name').textContent = currentProduct.name;
    document.getElementById('product-description').textContent = currentProduct.description;
    document.getElementById('product-price').textContent = `$${currentProduct.price.toFixed(2)}`;
    document.getElementById('subtotal').textContent = `$${currentProduct.price.toFixed(2)}`;
    document.getElementById('total').textContent = `$${currentProduct.price.toFixed(2)}`;
    document.getElementById('button-text').textContent = `Pay $${currentProduct.price.toFixed(2)}`;
    
    // Update icon
    const iconElement = document.querySelector('.order-icon');
    iconElement.className = `fab ${currentProduct.icon} order-icon`;
}

// Initialize Stripe Elements
async function initializeStripe() {
    try {
        stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
        elements = stripe.elements();
        
        // Create card element
        cardElement = elements.create('card', {
            style: {
                base: {
                    fontSize: '16px',
                    color: '#2d3748',
                    '::placeholder': {
                        color: '#a0aec0',
                    },
                    fontFamily: 'Inter, sans-serif',
                },
                invalid: {
                    color: '#e53e3e',
                },
            },
        });
        
        cardElement.mount('#card-element');
        
        // Handle real-time validation errors
        cardElement.on('change', (event) => {
            const displayError = document.getElementById('card-errors');
            if (event.error) {
                displayError.textContent = event.error.message;
            } else {
                displayError.textContent = '';
            }
        });
    } catch (error) {
        console.error('Stripe initialization error:', error);
        showMessage('Error initializing payment system. Please refresh the page.', 'error');
    }
}

// Handle form submission
const form = document.getElementById('payment-form');
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const email = document.getElementById('email').value;
    const name = document.getElementById('name').value;
    const termsAccepted = document.getElementById('terms').checked;
    
    if (!termsAccepted) {
        showMessage('Please accept the Terms of Service and Privacy Policy', 'error');
        return;
    }
    
    setLoading(true);
    
    try {
        // In production, this would call your backend to create a payment intent
        // For now, we'll simulate the payment process
        
        // DEMO MODE: Comment this out and uncomment Stripe integration in production
        await simulatePayment(email, name);
        
        /* PRODUCTION CODE: Uncomment this for real Stripe integration
        
        // Create payment intent on your backend
        const response = await fetch('/api/create-payment-intent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                product: productType,
                email: email,
                name: name,
                amount: currentProduct.price * 100, // Convert to cents
            }),
        });
        
        const { clientSecret } = await response.json();
        
        // Confirm payment with Stripe
        const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
            payment_method: {
                card: cardElement,
                billing_details: {
                    name: name,
                    email: email,
                },
            },
        });
        
        if (error) {
            showMessage(error.message, 'error');
            setLoading(false);
        } else if (paymentIntent.status === 'succeeded') {
            handlePaymentSuccess(email);
        }
        
        */
        
    } catch (error) {
        console.error('Payment error:', error);
        showMessage('Payment failed. Please try again.', 'error');
        setLoading(false);
    }
});

// Simulate payment for demo (remove in production)
async function simulatePayment(email, name) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Store purchase info in localStorage
    const purchaseInfo = {
        email: email,
        name: name,
        product: currentProduct.name,
        price: currentProduct.price,
        date: new Date().toISOString(),
        downloadUrl: currentProduct.downloadUrl
    };
    
    localStorage.setItem('purchase_info', JSON.stringify(purchaseInfo));
    
    // Show success
    handlePaymentSuccess(email);
}

// Handle successful payment
function handlePaymentSuccess(email) {
    setLoading(false);
    
    // Update modal with user email
    document.getElementById('user-email').textContent = email;
    
    // Show success modal
    const modal = document.getElementById('success-modal');
    modal.classList.remove('hidden');
    
    // Send confirmation email (in production, this would be done by backend)
    console.log('Sending confirmation email to:', email);
}

// Download handler
document.getElementById('download-now').addEventListener('click', () => {
    if (currentProduct.downloadUrl) {
        // Start download
        const link = document.createElement('a');
        link.href = currentProduct.downloadUrl;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showMessage('Download started! Check your downloads folder.', 'success');
    } else {
        showMessage('Your account has been activated. Check your email for details.', 'success');
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
        buttonText.textContent = 'Processing...';
    } else {
        submitButton.disabled = false;
        spinner.classList.add('hidden');
        buttonText.textContent = `Pay $${currentProduct.price.toFixed(2)}`;
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
    
    // Only initialize Stripe if not in demo mode
    // Uncomment this in production with your real Stripe key
    // initializeStripe();
    
    console.log('Payment page loaded in DEMO mode');
    console.log('To enable real payments:');
    console.log('1. Add your Stripe publishable key');
    console.log('2. Create backend API endpoint for payment intent');
    console.log('3. Uncomment Stripe integration code');
    console.log('4. Comment out simulatePayment function');
});
