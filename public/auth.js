// Authentication Logic with Supabase
// Handles Login, Sign Up, and redirects to payment

// Supabase Configuration
const SUPABASE_URL = 'https://npdysfxewryqcmmztdxl.supabase.co'; // Replace with your Supabase URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZHlzZnhld3J5cWNtbXp0ZHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNzMyMjUsImV4cCI6MjA3Nzk0OTIyNX0.WsEnKex2VNpY-uKB5oVjK9iEK7Ce1o1dfRWLE5z2nIc'; // Replace with your Supabase anon key

// Initialize Supabase client with NO PERSISTENCE (session-only)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: false, // Don't persist session
        autoRefreshToken: false, // Don't auto-refresh
        detectSessionInUrl: false // Don't detect session in URL
    }
});

console.log('⚠️ SESSION-ONLY MODE: You must log in every time you visit');

// Get product type from URL
const urlParams = new URLSearchParams(window.location.search);
const productType = urlParams.get('product') || 'windows';

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setupTabSwitching();
    setupFormHandlers();
    checkExistingAuth();
});

// Tab Switching
function setupTabSwitching() {
    const tabs = document.querySelectorAll('.auth-tab');
    const forms = document.querySelectorAll('.auth-form');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // Update tabs
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update forms
            forms.forEach(form => {
                if (form.id === `${targetTab}-form`) {
                    form.classList.add('active');
                } else {
                    form.classList.remove('active');
                }
            });

            // Clear messages
            hideMessage();
        });
    });
}

// Form Handlers
function setupFormHandlers() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    loginForm.addEventListener('submit', handleLogin);
    signupForm.addEventListener('submit', handleSignup);

    // Social buttons
    document.querySelectorAll('.btn-social.google').forEach(btn => {
        btn.addEventListener('click', () => handleSocialAuth('google'));
    });

    document.querySelectorAll('.btn-social.microsoft').forEach(btn => {
        btn.addEventListener('click', () => handleSocialAuth('microsoft'));
    });
}

// Handle Login with Supabase
// Authentication flow for Interview AI auth page
(function initInterviewAIAuth() {
    if (window.__interviewAIAuthLoaded) {
        return;
    }
    window.__interviewAIAuthLoaded = true;

    const SUPABASE_URL = 'https://npdysfxewryqcmmztdxl.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZHlzZnhld3J5cWNtbXp0ZHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNzMyMjUsImV4cCI6MjA3Nzk0OTIyNX0.WsEnKex2VNpY-uKB5oVjK9iEK7Ce1o1dfRWLE5z2nIc';

    const supabaseLibrary = window.supabase;
    // Session-only Supabase client (no persistence)
    const supabase = supabaseLibrary.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false, // Don't persist session
            autoRefreshToken: false, // Don't auto-refresh
            detectSessionInUrl: false // Don't detect session in URL
        }
    });
    
    console.log('⚠️ SESSION-ONLY MODE: Login required on every visit');
    
    const urlParams = new URLSearchParams(window.location.search);
    const productType = urlParams.get('product') || 'windows';
    let recoveryFlowActive = false;

    document.addEventListener('DOMContentLoaded', async () => {
        setupTabSwitching();
        setupFormHandlers();
        await handlePasswordRecoveryIfNeeded();
        if (!recoveryFlowActive) {
            await checkExistingAuth();
        }
    });

function setupTabSwitching() {
    const tabs = Array.from(document.querySelectorAll('.auth-tab'));
    const forms = Array.from(document.querySelectorAll('.auth-form'));

    function activateTab(tabName) {
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        forms.forEach(form => {
            form.classList.toggle('active', form.id === `${tabName}-form`);
        });

        hideMessage();
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => activateTab(tab.dataset.tab));
    });

    // expose so recovery flow can switch back to login
    window.activateAuthTab = activateTab;
}

function setupFormHandlers() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const forgotLink = document.querySelector('.forgot-link');
    const forgotModal = document.getElementById('forgot-password-modal');
    const forgotClose = document.getElementById('forgot-password-close');
    const forgotForm = document.getElementById('forgot-password-form');
    const resetModal = document.getElementById('reset-password-modal');
    const resetClose = document.getElementById('reset-password-close');
    const resetForm = document.getElementById('reset-password-form');

    loginForm?.addEventListener('submit', handleLogin);
    signupForm?.addEventListener('submit', handleSignup);

    document.querySelectorAll('.btn-social.google').forEach(btn => {
        btn.addEventListener('click', () => handleSocialAuth('google'));
    });

    document.querySelectorAll('.btn-social.microsoft').forEach(btn => {
        btn.addEventListener('click', () => handleSocialAuth('microsoft'));
    });

    forgotLink?.addEventListener('click', event => {
        event.preventDefault();
        openModal(forgotModal);
    });

    forgotClose?.addEventListener('click', () => closeModal(forgotModal));
    forgotModal?.addEventListener('click', event => {
        if (event.target === forgotModal) {
            closeModal(forgotModal);
        }
    });
    forgotForm?.addEventListener('submit', handleForgotPassword);

    resetClose?.addEventListener('click', () => closeModal(resetModal));
    resetModal?.addEventListener('click', event => {
        if (event.target === resetModal) {
            closeModal(resetModal);
        }
    });
    resetForm?.addEventListener('submit', handleResetPassword);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeModal(forgotModal);
            closeModal(resetModal);
        }
    });
}

async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('remember-me').checked;

    if (!email || !password) {
        showMessage('Please fill in all fields', 'error');
        return;
    }

    const submitButton = event.target.querySelector('button[type="submit"]');
    const spinner = submitButton?.querySelector('.spinner');
    const buttonText = submitButton?.querySelector('span');

    if (submitButton && spinner && buttonText) {
        submitButton.disabled = true;
        spinner.classList.remove('hidden');
        buttonText.textContent = 'Signing in...';
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            throw error;
        }

        const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .limit(1);

        const profile = Array.isArray(profileData) ? profileData[0] : profileData;

        const userData = {
            id: data.user.id,
            email: data.user.email,
            name: profile?.name || data.user.user_metadata?.name || email.split('@')[0],
            phone: profile?.phone || data.user.user_metadata?.phone || '',
            authenticated: true,
            timestamp: Date.now(),
            supabase_session: data.session || null
        };

        // SESSION-ONLY: Store in sessionStorage only (cleared when tab closes)
        sessionStorage.setItem('interviewai_user', JSON.stringify(userData));
        console.log('⚠️ Session stored (tab-only) - Login required on next visit');

        showMessage('Login successful! Redirecting...', 'success');

        setTimeout(() => {
            // Check if there's a redirect URL parameter
            const redirectUrl = urlParams.get('redirect');
            if (redirectUrl) {
                window.location.href = redirectUrl;
            } else {
                // Default redirect to home page
                window.location.href = 'index.html';
            }
        }, 800);
    } catch (error) {
        console.error('Login error:', error);
        showMessage(error.message || 'Login failed. Please try again.', 'error');
    } finally {
        if (submitButton && spinner && buttonText) {
            submitButton.disabled = false;
            spinner.classList.add('hidden');
            buttonText.textContent = 'Sign In';
        }
    }
}

async function handleSignup(event) {
    event.preventDefault();

    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const rawPhone = document.getElementById('signup-phone').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    const agreeTerms = document.getElementById('agree-terms').checked;

    if (!name || !email || !rawPhone || !password || !confirmPassword) {
        showMessage('Please fill in all fields', 'error');
        return;
    }

    if (!agreeTerms) {
        showMessage('Please agree to the terms and conditions', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showMessage('Passwords do not match', 'error');
        return;
    }

    if (password.length < 8) {
        showMessage('Password must be at least 8 characters', 'error');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showMessage('Please enter a valid email address', 'error');
        return;
    }

    const normalizedPhone = rawPhone.replace(/[^\d+]/g, '');
    const phoneRegex = /^[+]?\d{10,13}$/;
    if (!phoneRegex.test(normalizedPhone)) {
        showMessage('Please enter a valid phone number', 'error');
        return;
    }

    const submitButton = event.target.querySelector('button[type="submit"]');
    const spinner = submitButton?.querySelector('.spinner');
    const buttonText = submitButton?.querySelector('span');

    if (submitButton && spinner && buttonText) {
        submitButton.disabled = true;
        spinner.classList.remove('hidden');
        buttonText.textContent = 'Creating account...';
    }

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { name, phone: normalizedPhone },
                emailRedirectTo: window.location.origin + '/index.html'
            }
        });

        if (error) {
            throw error;
        }

        if (data.user) {
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([
                    {
                        id: data.user.id,
                        name,
                        email,
                        phone: normalizedPhone,
                        created_at: new Date().toISOString()
                    }
                ]);

            if (profileError && profileError.code !== '23505') {
                console.warn('Profile creation error:', profileError);
            }
        }

        const userData = {
            id: data.user?.id || null,
            name,
            email,
            phone: normalizedPhone,
            authenticated: true,
            timestamp: Date.now(),
            supabase_session: data.session || null
        };

        // SESSION-ONLY: Store in sessionStorage only (cleared when tab closes)
        sessionStorage.setItem('interviewai_user', JSON.stringify(userData));
        console.log('⚠️ Session stored (tab-only) - Login required on next visit');

        showMessage('Account created successfully! Redirecting...', 'success');

        setTimeout(() => {
            // Check if there's a redirect URL parameter
            const redirectUrl = urlParams.get('redirect');
            if (redirectUrl) {
                window.location.href = redirectUrl;
            } else {
                // Default redirect to home page
                window.location.href = 'index.html';
            }
        }, 1000);
    } catch (error) {
        console.error('Signup error:', error);
        let errorMessage = 'Sign up failed. Please try again.';

        if (error?.message === 'User already registered') {
            errorMessage = 'An account with this email already exists. Please login instead.';
        } else if (error?.message) {
            errorMessage = error.message;
        }

        showMessage(errorMessage, 'error');
    } finally {
        if (submitButton && spinner && buttonText) {
            submitButton.disabled = false;
            spinner.classList.add('hidden');
            buttonText.textContent = 'Create Account';
        }
    }
}

async function handleSocialAuth(provider) {
    try {
        // Check if there's a redirect URL parameter
        const redirectUrl = urlParams.get('redirect');
        const finalRedirectUrl = redirectUrl 
            ? `${window.location.origin}/${redirectUrl}` 
            : `${window.location.origin}/profile.html`;

        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: finalRedirectUrl
            }
        });

        if (error) {
            throw error;
        }
    } catch (error) {
        console.error('Social auth error:', error);
        showMessage(`${provider.charAt(0).toUpperCase() + provider.slice(1)} authentication failed. Please try again.`, 'error');
    }
}

async function checkExistingAuth() {
    // SESSION-ONLY: Don't check for existing session
    // Force user to log in every time
    console.log('⚠️ Session-only mode: No automatic login');
    return; // Always show login form
}

function getUserData() {
    // SESSION-ONLY: Only check sessionStorage (not localStorage)
    const sessionData = sessionStorage.getItem('interviewai_user');

    if (sessionData) {
        return JSON.parse(sessionData);
    }

    if (sessionData) {
        return JSON.parse(sessionData);
    }

    return null;
}

async function logout() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) {
            throw error;
        }

        clearStoredUserData();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

async function handleForgotPassword(event) {
    event.preventDefault();

    const emailInput = document.getElementById('forgot-email');
    const email = emailInput?.value.trim();

    if (!email) {
        showMessage('Please enter the email you used to sign up.', 'error');
        return;
    }

    const submitButton = event.target.querySelector('button[type="submit"]');
    const spinner = submitButton?.querySelector('.spinner');
    const buttonText = submitButton?.querySelector('span');

    if (submitButton && spinner && buttonText) {
        submitButton.disabled = true;
        spinner.classList.remove('hidden');
        buttonText.textContent = 'Sending link...';
    }

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth.html?product=${productType}`
        });

        if (error) {
            throw error;
        }

        closeModal(document.getElementById('forgot-password-modal'));
        emailInput.value = '';
        showMessage('Password reset email sent. Check your inbox.', 'success');
    } catch (error) {
        console.error('Forgot password error:', error);
        showMessage(error.message || 'Could not send reset email. Please try again.', 'error');
    } finally {
        if (submitButton && spinner && buttonText) {
            submitButton.disabled = false;
            spinner.classList.add('hidden');
            buttonText.textContent = 'Send reset link';
        }
    }
}

async function handlePasswordRecoveryIfNeeded() {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : '';
    if (!hash) {
        return;
    }

    const params = new URLSearchParams(hash);
    if (params.get('type') !== 'recovery') {
        return;
    }

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) {
        showMessage('Invalid password recovery link. Please request a new one.', 'error');
        return;
    }

    recoveryFlowActive = true;

    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) {
        console.error('Session recovery error:', error);
        showMessage('We could not validate the password reset link. Please request a new one.', 'error');
        return;
    }

    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    openModal(document.getElementById('reset-password-modal'));
    document.getElementById('reset-password')?.focus();
}

async function handleResetPassword(event) {
    event.preventDefault();

    const passwordInput = document.getElementById('reset-password');
    const confirmInput = document.getElementById('reset-confirm-password');
    const password = passwordInput?.value || '';
    const confirmPassword = confirmInput?.value || '';

    if (!password || !confirmPassword) {
        showMessage('Please enter and confirm your new password.', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showMessage('Passwords do not match.', 'error');
        return;
    }

    if (password.length < 8) {
        showMessage('Password must be at least 8 characters.', 'error');
        return;
    }

    const submitButton = event.target.querySelector('button[type="submit"]');
    const spinner = submitButton?.querySelector('.spinner');
    const buttonText = submitButton?.querySelector('span');

    if (submitButton && spinner && buttonText) {
        submitButton.disabled = true;
        spinner.classList.remove('hidden');
        buttonText.textContent = 'Updating password...';
    }

    try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
            throw error;
        }

        closeModal(document.getElementById('reset-password-modal'));
        passwordInput.value = '';
        confirmInput.value = '';
        recoveryFlowActive = false;

        if (typeof window.activateAuthTab === 'function') {
            window.activateAuthTab('login');
        }

        await supabase.auth.signOut();
        clearStoredUserData();
        showMessage('Password updated. Please sign in with your new password.', 'success');
    } catch (error) {
        console.error('Reset password error:', error);
        showMessage(error.message || 'Failed to update password. Please try again.', 'error');
    } finally {
        if (submitButton && spinner && buttonText) {
            submitButton.disabled = false;
            spinner.classList.add('hidden');
            buttonText.textContent = 'Update password';
        }
    }
}

function openModal(modal) {
    modal?.classList.add('active');
    modal?.classList.remove('hidden');
}

function closeModal(modal) {
    modal?.classList.remove('active');
    modal?.classList.add('hidden');
}

function showMessage(message, type = 'info') {
    const messageDiv = document.getElementById('auth-message');
    if (!messageDiv) {
        return;
    }

    messageDiv.textContent = message;
    messageDiv.className = type;
    messageDiv.classList.remove('hidden');

    if (type !== 'success') {
        window.setTimeout(() => {
            hideMessage();
        }, 5000);
    }
}

function hideMessage() {
    const messageDiv = document.getElementById('auth-message');
    messageDiv?.classList.add('hidden');
}

function clearStoredUserData() {
    localStorage.removeItem('interviewai_user');
    sessionStorage.removeItem('interviewai_user');
}

window.getUserData = getUserData;
window.supabaseClient = supabase;
window.supabase = supabase;
window.supabaseLib = supabaseLibrary;
window.logout = logout;
window.clearUserData = clearStoredUserData;
})();
