// Download page functionality
(function initDownloadPage() {
    if (window.__downloadPageLoaded) {
        return;
    }
    window.__downloadPageLoaded = true;

    let supabaseClient = null;
    let authSession = null;
    let authMode = 'signin';
    let pendingDownloadPlatform = null;
    let authSetupError = '';
    let authUiBound = false;
    let toastTimer = null;
    let authExpiryTimer = null;
    const AUTH_SESSION_STARTED_AT_KEY = 'interviewai_download_auth_started_at';
    const AUTH_SESSION_MAX_AGE_MS = 60 * 60 * 1000;

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        setupThemeToggle();
        detectPlatform();
        setupDownloadAuth().catch((error) => {
            console.error('Download auth setup failed:', error);
            authSetupError = 'Download login is not configured yet. Please try again later.';
            setAuthMessage(authSetupError, 'error');
        });
    });

    // Download function - picks correct Windows arch and uses API endpoint
    window.downloadApp = async function(platform) {
        if (!platform) {
            showToast('Download not available for this platform yet.', 'error');
            return;
        }

        pendingDownloadPlatform = platform;

        if (!supabaseClient) {
            openAuthModal(
                authSetupError || 'Download login is loading. Please wait a moment.',
                authSetupError ? 'error' : ''
            );
            return;
        }

        const session = await getCurrentSession();
        if (!session) {
            openAuthModal('Login or create a free account to download Interview AI.');
            return;
        }

        await startAuthenticatedDownload(platform, session);
    };

    async function setupDownloadAuth() {
        bindAuthUi();
        openInitialAuthIntent();

        if (window.location.protocol === 'file:') {
            authSetupError = 'Login/signup cannot run from a file path. Run npm run serve, then open http://localhost:3000/download.html?auth=signup.';
            setAuthMessage(authSetupError, 'error');
            showToast('Open this page through the local server to use login/signup.', 'error');
            return;
        }

        const config = await loadPublicConfig();
        if (!config.supabaseUrl || !config.supabaseAnonKey) {
            authSetupError = 'Supabase URL and anon key are missing from /api/public-config.';
            setAuthMessage(authSetupError, 'error');
            return;
        }

        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            authSetupError = 'Supabase client failed to load. Check the script CDN or network.';
            setAuthMessage(authSetupError, 'error');
            return;
        }

        supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: false,
            },
        });
        authSession = await getCurrentSession();
        updateAuthUi();
        scheduleAuthExpiry();

        supabaseClient.auth.onAuthStateChange((event, session) => {
            authSession = session;
            if (event === 'SIGNED_IN' && session) {
                markAuthSessionStarted(true);
            }
            if (event === 'SIGNED_OUT') {
                clearAuthSessionStarted();
            }
            updateAuthUi();
            scheduleAuthExpiry();
        });
    }

    async function loadPublicConfig() {
        const response = await fetch('/api/public-config', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Config request failed: ${response.status}`);
        }
        return response.json();
    }

    function bindAuthUi() {
        if (authUiBound) {
            return;
        }
        authUiBound = true;

        document.addEventListener('click', handlePageClick);

        const form = document.getElementById('download-auth-form');
        if (form) {
            form.addEventListener('submit', handleAuthSubmit);
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeAuthModal();
                closeProfileMenu();
            }
        });
    }

    async function handlePageClick(event) {
        const passwordToggle = event.target.closest('[data-password-toggle]');
        if (passwordToggle) {
            event.preventDefault();
            togglePasswordVisibility(passwordToggle);
            return;
        }

        const logoutButton = event.target.closest('[data-auth-logout]');
        if (logoutButton) {
            event.preventDefault();
            await performSignOut();
            return;
        }

        const profileToggle = event.target.closest('[data-profile-toggle]');
        if (profileToggle) {
            event.preventDefault();
            toggleProfileMenu(profileToggle);
            return;
        }

        if (!event.target.closest('[data-auth-profile]')) {
            closeProfileMenu();
        }

        const closeTarget = event.target.closest('[data-auth-close]');
        if (closeTarget) {
            event.preventDefault();
            closeAuthModal();
            return;
        }

        const modeButton = event.target.closest('[data-auth-mode]');
        if (modeButton) {
            event.preventDefault();
            setAuthMode(modeButton.getAttribute('data-auth-mode') || 'signin');
            return;
        }

        const openButton = event.target.closest('[data-auth-open]');
        if (openButton) {
            event.preventDefault();
            pendingDownloadPlatform = 'windows';
            setAuthMode(openButton.getAttribute('data-auth-open') || 'signin');
            openAuthModal(
                authSession
                    ? 'You are already logged in. Click download to continue.'
                    : 'Login or create a free account to download Interview AI.'
            );
            return;
        }

        const downloadButton = event.target.closest('[data-download-platform]');
        if (downloadButton) {
            event.preventDefault();
            const platform = downloadButton.getAttribute('data-download-platform');
            window.downloadApp(platform);
        }
    }

    function togglePasswordVisibility(button) {
        const passwordInput = document.getElementById('download-auth-password');
        if (!passwordInput) return;

        const isVisible = passwordInput.type === 'text';
        passwordInput.type = isVisible ? 'password' : 'text';
        button.setAttribute('aria-pressed', String(!isVisible));
        button.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');

        const icon = button.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-eye', isVisible);
            icon.classList.toggle('fa-eye-slash', !isVisible);
        }
    }

    function toggleProfileMenu(button) {
        const menu = document.querySelector('[data-profile-menu]');
        if (!menu) return;

        const willOpen = menu.classList.contains('hidden');
        menu.classList.toggle('hidden', !willOpen);
        button.setAttribute('aria-expanded', String(willOpen));
    }

    function closeProfileMenu() {
        const menu = document.querySelector('[data-profile-menu]');
        const trigger = document.querySelector('[data-profile-toggle]');
        if (menu) {
            menu.classList.add('hidden');
        }
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
        }
    }

    async function performSignOut(message = 'Signed out successfully.') {
        closeProfileMenu();
        clearAuthSessionStarted();
        clearAuthExpiryTimer();

        if (supabaseClient) {
            await supabaseClient.auth.signOut().catch((error) => {
                console.warn('Supabase sign out failed:', error?.message || error);
            });
        }

        authSession = null;
        updateAuthUi();
        setAuthMessage('Signed out.', 'success');
        showToast(message, 'success');
    }

    async function handleAuthSubmit(event) {
        event.preventDefault();

        if (!supabaseClient) {
            setAuthMessage('Download login is not configured yet.', 'error');
            return;
        }

        const email = document.getElementById('download-auth-email')?.value.trim();
        const password = document.getElementById('download-auth-password')?.value;
        if (!email) {
            setAuthMessage('Enter your email address.', 'error');
            showToast('Enter your email address.', 'error');
            return;
        }

        if (!isValidEmail(email)) {
            setAuthMessage('Enter a valid email address.', 'error');
            showToast('Enter a valid email address.', 'error');
            return;
        }

        if (!password) {
            setAuthMessage('Enter your password.', 'error');
            showToast('Enter your password.', 'error');
            return;
        }

        if (authMode === 'signup' && password.length < 6) {
            setAuthMessage('Password must be at least 6 characters.', 'error');
            showToast('Password must be at least 6 characters.', 'error');
            return;
        }

        setAuthLoading(true);
        setAuthMessage('', '');

        try {
            let result;
            if (authMode === 'signup') {
                result = await supabaseClient.auth.signUp({ email, password });
                if (result.error) throw result.error;

                authSession = result.data.session;
                if (!authSession) {
                    setAuthMessage('Signup successful. Check your email to confirm, then login.', 'success');
                    showToast('Signup successful. Check your email to confirm.', 'success');
                    return;
                }
            } else {
                result = await supabaseClient.auth.signInWithPassword({ email, password });
                if (result.error) throw result.error;
                authSession = result.data.session;
            }

            markAuthSessionStarted(true);
            updateAuthUi();
            scheduleAuthExpiry();
            const successMessage = authMode === 'signup'
                ? 'Signup successful. Starting download...'
                : 'Successfully logged in. Starting download...';
            setAuthMessage(successMessage, 'success');
            showToast(successMessage, 'success');
            const platform = pendingDownloadPlatform || 'windows';
            const downloadStarted = await startAuthenticatedDownload(platform, authSession);
            if (downloadStarted) {
                closeAuthModal();
            }
        } catch (error) {
            const message = friendlyAuthError(error, authMode);
            setAuthMessage(message, 'error');
            showToast(message, 'error');
        } finally {
            setAuthLoading(false);
        }
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function friendlyAuthError(error, mode) {
        const rawMessage = `${error?.message || error?.error_description || error || ''}`.trim();
        const normalized = rawMessage.toLowerCase();

        if (!rawMessage) {
            return mode === 'signup'
                ? 'Signup failed. Please check your details and try again.'
                : 'Login failed. Please check your email and password.';
        }

        if (normalized.includes('invalid login credentials')) {
            return 'Invalid email or password.';
        }

        if (normalized.includes('email not confirmed') || normalized.includes('confirm your email')) {
            return 'Please confirm your email before logging in.';
        }

        if (normalized.includes('already registered') || normalized.includes('user already')) {
            return 'This email already has an account. Try Login instead.';
        }

        if (normalized.includes('password') && (normalized.includes('six') || normalized.includes('6') || normalized.includes('weak'))) {
            return 'Password must be at least 6 characters.';
        }

        if (normalized.includes('signup') && normalized.includes('disabled')) {
            return 'Signup is currently disabled for this project.';
        }

        if (normalized.includes('rate') || normalized.includes('too many') || normalized.includes('over request')) {
            return 'Too many attempts. Please wait a minute and try again.';
        }

        if (normalized.includes('network') || normalized.includes('failed to fetch')) {
            return 'Network error. Check your internet connection and try again.';
        }

        return rawMessage;
    }

    function decodeJwtPayload(token) {
        if (!token || typeof token !== 'string') return null;

        const payload = token.split('.')[1];
        if (!payload) return null;

        try {
            const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, '=');
            return JSON.parse(atob(padded));
        } catch (_error) {
            return null;
        }
    }

    function markAuthSessionStarted(forceNew = false) {
        if (!authSession) return 0;

        const stored = Number(localStorage.getItem(AUTH_SESSION_STARTED_AT_KEY));
        if (!forceNew && Number.isFinite(stored) && stored > 0) {
            return stored;
        }

        const startedAt = Date.now();
        localStorage.setItem(AUTH_SESSION_STARTED_AT_KEY, String(startedAt));
        return startedAt;
    }

    function getAuthSessionStartedAt(session = authSession) {
        const stored = Number(localStorage.getItem(AUTH_SESSION_STARTED_AT_KEY));
        if (Number.isFinite(stored) && stored > 0) {
            return stored;
        }

        const payload = decodeJwtPayload(session?.access_token);
        const tokenStartedAt = Number(payload?.iat) > 0 ? Number(payload.iat) * 1000 : 0;
        const startedAt = tokenStartedAt || Date.now();
        localStorage.setItem(AUTH_SESSION_STARTED_AT_KEY, String(startedAt));
        return startedAt;
    }

    function clearAuthSessionStarted() {
        localStorage.removeItem(AUTH_SESSION_STARTED_AT_KEY);
    }

    function getAuthSessionExpiresAt(session = authSession) {
        if (!session) return 0;
        return getAuthSessionStartedAt(session) + AUTH_SESSION_MAX_AGE_MS;
    }

    function isAuthSessionExpired(session = authSession) {
        if (!session) return true;

        const expiresAt = getAuthSessionExpiresAt(session);
        const payload = decodeJwtPayload(session.access_token);
        const tokenExpiresAt = Number(payload?.exp) > 0 ? Number(payload.exp) * 1000 : 0;
        const effectiveExpiresAt = tokenExpiresAt ? Math.min(expiresAt, tokenExpiresAt) : expiresAt;

        return Date.now() >= effectiveExpiresAt;
    }

    function clearAuthExpiryTimer() {
        if (authExpiryTimer) {
            clearTimeout(authExpiryTimer);
            authExpiryTimer = null;
        }
    }

    function scheduleAuthExpiry() {
        clearAuthExpiryTimer();
        if (!authSession) return;

        const payload = decodeJwtPayload(authSession.access_token);
        const sessionExpiresAt = getAuthSessionExpiresAt(authSession);
        const tokenExpiresAt = Number(payload?.exp) > 0 ? Number(payload.exp) * 1000 : 0;
        const effectiveExpiresAt = tokenExpiresAt ? Math.min(sessionExpiresAt, tokenExpiresAt) : sessionExpiresAt;
        const delay = effectiveExpiresAt - Date.now();

        if (delay <= 0) {
            expireAuthSession();
            return;
        }

        authExpiryTimer = setTimeout(() => {
            expireAuthSession();
        }, Math.min(delay, 2147483647));
    }

    async function expireAuthSession() {
        closeProfileMenu();
        clearAuthSessionStarted();
        clearAuthExpiryTimer();

        if (supabaseClient) {
            await supabaseClient.auth.signOut().catch((error) => {
                console.warn('Supabase expiry sign out failed:', error?.message || error);
            });
        }

        authSession = null;
        updateAuthUi();
        openAuthModal('Your 60-minute login session expired. Please login again.', 'error');
        showToast('Your login session expired. Please login again.', 'error');
    }

    function formatSessionExpiry(session = authSession) {
        if (!session) return '';

        const expiresAt = getAuthSessionExpiresAt(session);
        const minutesLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000));
        const time = new Date(expiresAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        });

        return `Expires at ${time} (${minutesLeft} min left)`;
    }

    async function getCurrentSession() {
        if (!supabaseClient) return null;
        if (authSession) {
            if (isAuthSessionExpired(authSession)) {
                await expireAuthSession();
                return null;
            }
            return authSession;
        }

        const { data, error } = await supabaseClient.auth.getSession();
        if (error) {
            console.warn('Could not read Supabase session:', error.message);
            return null;
        }
        authSession = data.session;

        if (authSession && isAuthSessionExpired(authSession)) {
            await expireAuthSession();
            return null;
        }

        if (authSession) {
            scheduleAuthExpiry();
        }

        return authSession;
    }

    async function startAuthenticatedDownload(platform, session) {
        if (!session || !session.access_token) {
            openAuthModal('Login or create a free account to download Interview AI.');
            return false;
        }

        if (isAuthSessionExpired(session)) {
            await expireAuthSession();
            return false;
        }

        showToast('Preparing your download...', 'info');

        // Detect Windows arch
        let archParam = '';
        if (platform === 'windows') {
            const ua = navigator.userAgent.toLowerCase();
            const isArm = ua.includes('arm64') || ua.includes('aarch64');
            const is32 = ua.includes('wow64') || ua.includes('win64') === false && ua.includes('win32');
            if (isArm) {
                archParam = '&arch=arm64'; // future-proof (falls back server-side)
            } else if (is32) {
                archParam = '&arch=ia32';
            } else {
                archParam = '&arch=x64';
            }
        }

        // Ask the protected API for the real installer URL.
        const downloadUrl = `/api/download?platform=${platform}${archParam}`;
        let response;
        let payload;
        try {
            response = await fetch(downloadUrl, {
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
                cache: 'no-store',
            });
            payload = await response.json().catch(() => ({}));
        } catch (error) {
            const message = friendlyAuthError(error, authMode);
            setAuthMessage(message, 'error');
            showToast(message, 'error');
            return false;
        }

        if (response.status === 401) {
            authSession = null;
            const message = payload.error || 'Your login expired. Please login again.';
            openAuthModal(message, 'error');
            showToast(message, 'error');
            return false;
        }

        if (!response.ok || !payload.url) {
            showToast(payload.error || 'Could not start download. Please try again.', 'error');
            return false;
        }

        // Create invisible link and trigger download from the signed-in flow.
        const link = document.createElement('a');
        link.href = payload.url;
        link.style.display = 'none';
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        
        // Clean up after a delay
        setTimeout(() => {
            document.body.removeChild(link);
        }, 100);

        // Track download
        trackDownload(platform);
        showToast('Your download will begin shortly...', 'success');
        return true;
    }

    function openAuthModal(message, type = '') {
        const modal = document.getElementById('download-auth-modal');
        if (!modal) return;
        setAuthMessage(message || '', type);
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        setTimeout(() => document.getElementById('download-auth-email')?.focus(), 50);
    }

    function closeAuthModal() {
        const modal = document.getElementById('download-auth-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }

    function setAuthMode(mode) {
        authMode = mode === 'signup' ? 'signup' : 'signin';
        document.querySelectorAll('[data-auth-mode]').forEach((button) => {
            button.classList.toggle('active', button.getAttribute('data-auth-mode') === authMode);
        });
        resetPasswordVisibility();
        updateAuthUi();
        setAuthMessage('', '');
    }

    function resetPasswordVisibility() {
        const passwordInput = document.getElementById('download-auth-password');
        const passwordToggle = document.querySelector('[data-password-toggle]');
        if (!passwordInput || !passwordToggle) return;

        passwordInput.type = 'password';
        passwordToggle.setAttribute('aria-pressed', 'false');
        passwordToggle.setAttribute('aria-label', 'Show password');

        const icon = passwordToggle.querySelector('i');
        if (icon) {
            icon.classList.add('fa-eye');
            icon.classList.remove('fa-eye-slash');
        }
    }

    function setAuthLoading(isLoading) {
        const submit = document.getElementById('download-auth-submit');
        if (!submit) return;
        submit.disabled = isLoading;
        const label = submit.querySelector('span');
        if (label) {
            label.textContent = isLoading
                ? 'Please wait...'
                : (authMode === 'signup' ? 'Create Account and Download' : 'Login and Download');
        }
    }

    function setAuthMessage(message, type) {
        const element = document.getElementById('download-auth-message');
        if (!element) return;
        element.textContent = message || '';
        element.classList.toggle('error', type === 'error');
        element.classList.toggle('success', type === 'success');
    }

    function updateAuthUi() {
        const title = document.getElementById('download-auth-title');
        const submit = document.getElementById('download-auth-submit');
        const signOut = document.getElementById('download-auth-signout');
        const submitLabel = submit?.querySelector('span');
        const form = document.getElementById('download-auth-form');
        const tabs = document.querySelector('.download-auth-tabs');
        const sessionCard = document.querySelector('[data-auth-session-card]');
        const isSignedIn = Boolean(authSession);
        const profileEmail = authSession?.user?.email || decodeJwtPayload(authSession?.access_token)?.email || 'Signed in user';
        const profileExpiry = isSignedIn ? formatSessionExpiry(authSession) : '';

        if (title) {
            title.textContent = isSignedIn
                ? 'Your download profile'
                : (authMode === 'signup' ? 'Create account to download' : 'Sign in to download');
        }

        if (submitLabel) {
            submitLabel.textContent = authMode === 'signup' ? 'Create Account and Download' : 'Login and Download';
        }

        document.querySelectorAll('[data-auth-logged-out]').forEach((element) => {
            element.classList.toggle('hidden', isSignedIn);
        });

        document.querySelectorAll('[data-auth-profile]').forEach((element) => {
            element.classList.toggle('hidden', !isSignedIn);
        });

        document.querySelectorAll('[data-profile-email]').forEach((element) => {
            element.textContent = profileEmail;
        });

        document.querySelectorAll('[data-profile-expiry]').forEach((element) => {
            element.textContent = profileExpiry || 'Session expires within 60 min';
        });

        if (form) {
            form.classList.toggle('hidden', isSignedIn);
        }

        if (tabs) {
            tabs.classList.toggle('hidden', isSignedIn);
        }

        if (sessionCard) {
            sessionCard.classList.toggle('hidden', !isSignedIn);
        }

        if (signOut) {
            signOut.classList.toggle('hidden', !isSignedIn);
        }
    }

    function openInitialAuthIntent() {
        const authIntent = new URLSearchParams(window.location.search).get('auth');
        if (!authIntent) return;

        const mode = authIntent === 'signup' ? 'signup' : 'signin';
        pendingDownloadPlatform = 'windows';
        setAuthMode(mode);
        openAuthModal(mode === 'signup'
            ? 'Create a free account to download Interview AI.'
            : 'Login to download Interview AI.');
    }

    // Auto-detect user's platform
    function detectPlatform() {
        const userAgent = navigator.userAgent.toLowerCase();
        let platform = 'windows'; // default

        if (userAgent.includes('mac')) {
            platform = 'mac';
        } else if (userAgent.includes('linux')) {
            platform = 'linux';
        }

        // Highlight the detected platform card
        highlightPlatform(platform);
    }

    function highlightPlatform(platform) {
        const cards = document.querySelectorAll('.platform-card');
        cards.forEach(card => {
            const btn = card.querySelector('.btn-download-primary');
            if (btn && btn.getAttribute('data-download-platform') === platform) {
                card.style.border = '2px solid #10b981';
                card.style.boxShadow = '0 4px 20px rgba(16, 185, 129, 0.15)';
            }
        });
    }

    function showToast(message, type = 'info') {
        const toast = document.getElementById('download-toast');
        if (!toast) return;

        const span = toast.querySelector('span');
        if (span) {
            span.textContent = message;
        }

        toast.classList.remove('success', 'error', 'info');
        toast.classList.add(type === 'success' || type === 'error' ? type : 'info');
        toast.classList.remove('hidden');

        if (toastTimer) {
            clearTimeout(toastTimer);
        }

        toastTimer = setTimeout(() => {
            toast.classList.add('hidden');
        }, type === 'error' ? 5000 : 3200);
    }

    function trackDownload(platform) {
        // Optional: Send analytics or track download
        console.log(`Download started for platform: ${platform}`);
        
        // You can add analytics tracking here
        // e.g., Google Analytics, Mixpanel, etc.
    }

    function setupThemeToggle() {
        const themeToggle = document.querySelector('.theme-toggle');

        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                document.documentElement.classList.toggle('dark');
                localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
            });
        }

        // Apply saved theme (default to dark)
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme !== 'light') {
            document.documentElement.classList.add('dark');
        }
    }
})();
