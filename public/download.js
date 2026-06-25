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
            showToast('Download not available for this platform yet');
            return;
        }

        pendingDownloadPlatform = platform;

        if (!supabaseClient) {
            openAuthModal(authSetupError || 'Download login is loading. Please wait a moment.');
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

        supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
        authSession = await getCurrentSession();
        updateAuthUi();

        supabaseClient.auth.onAuthStateChange((_event, session) => {
            authSession = session;
            updateAuthUi();
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
        document.querySelectorAll('[data-auth-close]').forEach((element) => {
            element.addEventListener('click', closeAuthModal);
        });

        document.querySelectorAll('[data-auth-mode]').forEach((button) => {
            button.addEventListener('click', () => {
                setAuthMode(button.getAttribute('data-auth-mode') || 'signin');
            });
        });

        const form = document.getElementById('download-auth-form');
        if (form) {
            form.addEventListener('submit', handleAuthSubmit);
        }

        const signOut = document.getElementById('download-auth-signout');
        if (signOut) {
            signOut.addEventListener('click', async () => {
                if (supabaseClient) {
                    await supabaseClient.auth.signOut();
                }
                authSession = null;
                setAuthMessage('Signed out.', 'success');
                updateAuthUi();
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeAuthModal();
            }
        });
    }

    async function handleAuthSubmit(event) {
        event.preventDefault();

        if (!supabaseClient) {
            setAuthMessage('Download login is not configured yet.', 'error');
            return;
        }

        const email = document.getElementById('download-auth-email')?.value.trim();
        const password = document.getElementById('download-auth-password')?.value;
        if (!email || !password) {
            setAuthMessage('Enter your email and password.', 'error');
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
                    setAuthMessage('Account created. Check your email to confirm, then come back and login.', 'success');
                    return;
                }
            } else {
                result = await supabaseClient.auth.signInWithPassword({ email, password });
                if (result.error) throw result.error;
                authSession = result.data.session;
            }

            updateAuthUi();
            setAuthMessage('Logged in. Starting download...', 'success');
            const platform = pendingDownloadPlatform || 'windows';
            await startAuthenticatedDownload(platform, authSession);
            closeAuthModal();
        } catch (error) {
            setAuthMessage(error.message || 'Login failed. Please try again.', 'error');
        } finally {
            setAuthLoading(false);
        }
    }

    async function getCurrentSession() {
        if (!supabaseClient) return null;
        if (authSession) return authSession;

        const { data, error } = await supabaseClient.auth.getSession();
        if (error) {
            console.warn('Could not read Supabase session:', error.message);
            return null;
        }
        authSession = data.session;
        return authSession;
    }

    async function startAuthenticatedDownload(platform, session) {
        if (!session || !session.access_token) {
            openAuthModal('Login or create a free account to download Interview AI.');
            return;
        }

        showToast('Preparing your download...');

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
        const response = await fetch(downloadUrl, {
            headers: {
                Authorization: `Bearer ${session.access_token}`,
            },
            cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));

        if (response.status === 401) {
            authSession = null;
            openAuthModal(payload.error || 'Your login expired. Please login again.');
            return;
        }

        if (!response.ok || !payload.url) {
            showToast(payload.error || 'Could not start download. Please try again.');
            return;
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
        showToast('Your download will begin shortly...');
    }

    function openAuthModal(message) {
        const modal = document.getElementById('download-auth-modal');
        if (!modal) return;
        setAuthMessage(message || '', message ? 'success' : '');
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
        updateAuthUi();
        setAuthMessage('', '');
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

        if (title) {
            title.textContent = authMode === 'signup' ? 'Create account to download' : 'Sign in to download';
        }

        if (submitLabel) {
            submitLabel.textContent = authMode === 'signup' ? 'Create Account and Download' : 'Login and Download';
        }

        if (signOut) {
            signOut.classList.toggle('hidden', !authSession);
        }
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
            if (btn && btn.getAttribute('onclick').includes(platform)) {
                card.style.border = '2px solid #10b981';
                card.style.boxShadow = '0 4px 20px rgba(16, 185, 129, 0.15)';
            }
        });
    }

    function showToast(message) {
        const toast = document.getElementById('download-toast');
        if (!toast) return;

        const span = toast.querySelector('span');
        if (span) {
            span.textContent = message;
        }

        toast.classList.remove('hidden');

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
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
