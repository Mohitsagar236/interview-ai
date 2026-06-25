// Header auth/profile state for non-download pages.
(function initSiteAuth() {
    if (window.__siteAuthLoaded) {
        return;
    }
    window.__siteAuthLoaded = true;

    let supabaseClient = null;
    let authSession = null;
    let authExpiryTimer = null;

    const AUTH_SESSION_STARTED_AT_KEY = 'interviewai_download_auth_started_at';
    const AUTH_SESSION_MAX_AGE_MS = 60 * 60 * 1000;

    document.addEventListener('DOMContentLoaded', () => {
        bindSiteAuthUi();
        setupSiteAuth().catch((error) => {
            console.warn('Site auth setup skipped:', error?.message || error);
            updateSiteAuthUi(null);
        });
    });

    function bindSiteAuthUi() {
        document.addEventListener('click', async (event) => {
            const profileToggle = event.target.closest('[data-site-profile-toggle]');
            if (profileToggle) {
                event.preventDefault();
                toggleProfileMenu(profileToggle);
                return;
            }

            const logoutButton = event.target.closest('[data-site-auth-logout]');
            if (logoutButton) {
                event.preventDefault();
                await signOutSiteUser();
                return;
            }

            if (!event.target.closest('[data-site-auth-profile]')) {
                closeProfileMenu();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeProfileMenu();
            }
        });
    }

    async function setupSiteAuth() {
        if (window.location.protocol === 'file:') {
            return;
        }

        const config = await loadPublicConfig();
        if (!config.supabaseUrl || !config.supabaseAnonKey) {
            return;
        }

        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            return;
        }

        supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: false,
            },
        });

        const { data, error } = await supabaseClient.auth.getSession();
        if (error) {
            console.warn('Could not read Supabase session:', error.message);
            updateSiteAuthUi(null);
            return;
        }

        authSession = data.session;
        if (authSession && isAuthSessionExpired(authSession)) {
            await expireSiteSession();
            return;
        }

        updateSiteAuthUi(authSession);
        scheduleAuthExpiry();

        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            authSession = session;

            if (event === 'SIGNED_IN' && session) {
                markAuthSessionStarted();
            }

            if (event === 'SIGNED_OUT') {
                clearAuthSessionStarted();
            }

            if (authSession && isAuthSessionExpired(authSession)) {
                await expireSiteSession();
                return;
            }

            updateSiteAuthUi(authSession);
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

    function toggleProfileMenu(button) {
        const dropdown = document.querySelector('[data-site-auth-profile]');
        if (!dropdown) return;

        const willOpen = !dropdown.classList.contains('active');
        dropdown.classList.toggle('active', willOpen);
        button.setAttribute('aria-expanded', String(willOpen));
    }

    function closeProfileMenu() {
        const dropdown = document.querySelector('[data-site-auth-profile]');
        const trigger = document.querySelector('[data-site-profile-toggle]');

        if (dropdown) {
            dropdown.classList.remove('active');
        }
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
        }
    }

    async function signOutSiteUser() {
        closeProfileMenu();
        clearAuthSessionStarted();
        clearAuthExpiryTimer();

        if (supabaseClient) {
            await supabaseClient.auth.signOut().catch((error) => {
                console.warn('Supabase sign out failed:', error?.message || error);
            });
        }

        authSession = null;
        updateSiteAuthUi(null);
    }

    async function expireSiteSession() {
        closeProfileMenu();
        clearAuthSessionStarted();
        clearAuthExpiryTimer();

        if (supabaseClient) {
            await supabaseClient.auth.signOut().catch((error) => {
                console.warn('Supabase expiry sign out failed:', error?.message || error);
            });
        }

        authSession = null;
        updateSiteAuthUi(null);
    }

    function updateSiteAuthUi(session) {
        const isSignedIn = Boolean(session);
        const email = session?.user?.email || decodeJwtPayload(session?.access_token)?.email || 'Signed in user';
        const name = formatProfileName(email);

        document.querySelectorAll('[data-site-auth-logged-out]').forEach((element) => {
            element.classList.toggle('hidden', isSignedIn);
        });

        document.querySelectorAll('[data-site-auth-profile]').forEach((element) => {
            element.classList.toggle('hidden', !isSignedIn);
            if (!isSignedIn) {
                element.classList.remove('active');
            }
        });

        document.querySelectorAll('[data-site-profile-email]').forEach((element) => {
            element.textContent = email;
        });

        document.querySelectorAll('[data-site-profile-name]').forEach((element) => {
            element.textContent = name;
        });
    }

    function formatProfileName(email) {
        const localPart = String(email || '').split('@')[0] || 'Interview AI user';
        return localPart
            .replace(/[._-]+/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
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

    function markAuthSessionStarted() {
        if (!localStorage.getItem(AUTH_SESSION_STARTED_AT_KEY)) {
            localStorage.setItem(AUTH_SESSION_STARTED_AT_KEY, String(Date.now()));
        }
    }

    function getAuthSessionStartedAt(session) {
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

    function getAuthSessionExpiresAt(session) {
        if (!session) return 0;
        return getAuthSessionStartedAt(session) + AUTH_SESSION_MAX_AGE_MS;
    }

    function isAuthSessionExpired(session) {
        if (!session) return true;

        const sessionExpiresAt = getAuthSessionExpiresAt(session);
        const payload = decodeJwtPayload(session.access_token);
        const tokenExpiresAt = Number(payload?.exp) > 0 ? Number(payload.exp) * 1000 : 0;
        const effectiveExpiresAt = tokenExpiresAt ? Math.min(sessionExpiresAt, tokenExpiresAt) : sessionExpiresAt;

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

        const sessionExpiresAt = getAuthSessionExpiresAt(authSession);
        const payload = decodeJwtPayload(authSession.access_token);
        const tokenExpiresAt = Number(payload?.exp) > 0 ? Number(payload.exp) * 1000 : 0;
        const effectiveExpiresAt = tokenExpiresAt ? Math.min(sessionExpiresAt, tokenExpiresAt) : sessionExpiresAt;
        const delay = effectiveExpiresAt - Date.now();

        if (delay <= 0) {
            expireSiteSession();
            return;
        }

        authExpiryTimer = setTimeout(() => {
            expireSiteSession();
        }, Math.min(delay, 2147483647));
    }

})();
