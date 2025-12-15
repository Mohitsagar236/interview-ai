// Authentication Logic with Supabase
// Handles Login, Sign Up, and redirects to payment

// Supabase Configuration
const SUPABASE_URL = 'https://npdysfxewryqcmmztdxl.supabase.co'; // Replace with your Supabase URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZHlzZnhld3J5cWNtbXp0ZHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNzMyMjUsImV4cCI6MjA3Nzk0OTIyNX0.WsEnKex2VNpY-uKB5oVjK9iEK7Ce1o1dfRWLE5z2nIc'; // Replace with your Supabase anon key

// Initialize (or reuse) a single Supabase client instance for the app
if (!window.__interviewAINativeSupabaseClient) {
    window.__interviewAINativeSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false, // Don't persist session (session-only mode)
            autoRefreshToken: false, // Don't auto-refresh
            // Allow parsing session from URL hash (needed to complete OAuth redirects)
            detectSessionInUrl: true
        }
    });
}
const supabase = window.__interviewAINativeSupabaseClient;
console.log('Supabase auth client initialized (detectSessionInUrl: true)');

console.log('⚠️ SESSION-ONLY MODE: You must log in every time you visit');
console.log("Tip: To enable persistent sessions in production, set `persistSession: true` when creating the client.");

// Get product type from URL
const urlParams = new URLSearchParams(window.location.search);
const productType = urlParams.get('product') || 'windows';


// Handle Login with Supabase
// Authentication flow for Interview AI auth page
(function initInterviewAIAuth() {
    if (window.__interviewAIAuthLoaded) {
        return;
    }
    window.__interviewAIAuthLoaded = true;

    // Use the global `supabase` client defined above (single instance)
    // Note: session-only mode is enabled (`persistSession: false`), so users must log in every visit
    console.log('⚠️ SESSION-ONLY MODE: Login required on every visit');

    let recoveryFlowActive = false;

    document.addEventListener('DOMContentLoaded', async () => {
        setupTabSwitching();
        setupFormHandlers();
        await handleOAuthCallback(); // Handle OAuth redirects first
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

    // Setup password visibility toggles
    setupPasswordToggles();
}

function setupPasswordToggles() {
    document.querySelectorAll('.password-toggle').forEach(toggle => {
        toggle.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const passwordInput = document.getElementById(targetId);
            
            if (passwordInput) {
                const isPassword = passwordInput.type === 'password';
                passwordInput.type = isPassword ? 'text' : 'password';
                
                // Toggle button state
                this.classList.toggle('show-password', isPassword);
                
                // Update icon - add eye-slash if showing password
                const eyeIcon = this.querySelector('.fa-eye');
                const eyeSlashIcon = this.querySelector('.fa-eye-slash');
                
                if (isPassword) {
                    // Now showing password
                    if (!eyeSlashIcon) {
                        const newIcon = document.createElement('i');
                        newIcon.className = 'fas fa-eye-slash';
                        this.appendChild(newIcon);
                    }
                } else {
                    // Now hiding password
                    if (eyeSlashIcon) {
                        eyeSlashIcon.remove();
                    }
                }
            }
        });
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
        // Get current origin (works for both localhost and production)
        const currentOrigin = window.location.origin;
        
        // Redirect back to auth.html to handle the OAuth callback
        const redirectUrl = urlParams.get('redirect');
        const callbackUrl = redirectUrl 
            ? `${currentOrigin}/auth.html?redirect=${encodeURIComponent(redirectUrl)}`
            : `${currentOrigin}/auth.html`;

        console.log('[OAuth] Initiating OAuth flow with redirect:', callbackUrl);

        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: callbackUrl
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

async function handleOAuthCallback() {
    // Check if we're returning from OAuth (hash contains access_token)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    
    if (!accessToken) {
        return; // Not an OAuth callback
    }
    
    console.log('[OAuth] Handling OAuth callback...');
    
    try {
        // If redirect contains access tokens, set the session manually
        const refreshToken = hashParams.get('refresh_token');
        if (accessToken) {
            console.log('[OAuth] Access token found in URL hash, setting session...');
            const { data: setData, error: setError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            });

            console.log('[OAuth] setSession result:', { setData, setError });

            if (setError) {
                throw setError;
            }

            // After setting session, try to obtain the session/user with retries
            let session = null;
            let user = null;
            const maxAttempts = 6;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                const { data, error: getError } = await supabase.auth.getSession();
                if (getError) {
                    console.warn(`[OAuth] getSession attempt ${attempt} error:`, getError);
                }

                session = data?.session || null;
                user = data?.user || null;

                console.log(`[OAuth] getSession attempt ${attempt}: user=${user ? user.email : 'null'}`);

                if (user) break;

                // wait before retrying
                await new Promise(res => setTimeout(res, 400));
            }

            console.log('[OAuth] final session after retries:', session);
            console.log('[OAuth] final user after retries:', user);

            if (!user) {
                throw new Error('Failed to establish user session after OAuth callback');
            }

            // use user from retries below
        } else {
            // no access token in hash - not an OAuth callback
            return;
        }

            if (user) {
            console.log('[OAuth] User authenticated via OAuth:', user.email);

            // Check if profile exists
            const { data: existingProfile, error: profileCheckError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();
            
            if (profileCheckError && profileCheckError.code !== 'PGRST116') {
                console.warn('[OAuth] Profile check error:', profileCheckError);
            }
            
            // Create profile if it doesn't exist
            if (!existingProfile) {
                console.log('[OAuth] Creating profile for OAuth user...');
                const { error: insertError } = await supabase
                    .from('profiles')
                    .insert([{
                        id: user.id,
                        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
                        email: user.email,
                        phone: user.user_metadata?.phone || '',
                        created_at: new Date().toISOString()
                    }]);
                
                if (insertError) {
                    console.warn('[OAuth] Profile creation warning:', insertError);
                }
            }
            
            // Store user data in session storage
            const userData = {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.full_name || user.user_metadata?.name || existingProfile?.name || user.email?.split('@')[0] || 'User',
                phone: existingProfile?.phone || user.user_metadata?.phone || '',
                authenticated: true,
                timestamp: Date.now(),
                supabase_session: session || null
            };
            
            sessionStorage.setItem('interviewai_user', JSON.stringify(userData));
            console.log('[OAuth] User data stored in session');
            
            // Show success message
            showMessage('Successfully signed in with Google!', 'success');

            // Clear URL hash to remove tokens from address bar
            window.history.replaceState(null, null, window.location.pathname + window.location.search);
            
            // Redirect after a short delay
            setTimeout(() => {
                // Check for redirect parameter
                const redirectUrl = urlParams.get('redirect');
                if (redirectUrl) {
                    window.location.href = redirectUrl;
                } else {
                    window.location.href = 'profile.html';
                }
            }, 800);
        }
    } catch (error) {
        console.error('[OAuth] Callback error:', error);
        showMessage('Authentication failed. Please try again.', 'error');
        // Clear the hash to prevent retry loops
        window.history.replaceState(null, null, window.location.pathname + window.location.search);
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
window.supabaseLib = supabase; // expose the shared client
window.logout = logout;
window.clearUserData = clearStoredUserData;
})();
