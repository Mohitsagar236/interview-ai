/**
 * Initialize Vercel Speed Insights for performance monitoring
 * Must run on client side only
 */
(function initSpeedInsights() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }
    try {
        import('@vercel/speed-insights').then(({ injectSpeedInsights }) => {
            injectSpeedInsights({ debug: false });
        }).catch(() => {});
    } catch (e) {}
})();

// Header authentication state management
(function initHeaderAuth() {
    if (window.__headerAuthLoaded) {
        return;
    }
    window.__headerAuthLoaded = true;

    const SUPABASE_URL = 'https://npdysfxewryqcmmztdxl.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZHlzZnhld3J5cWNtbXp0ZHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNzMyMjUsImV4cCI6MjA3Nzk0OTIyNX0.WsEnKex2VNpY-uKB5oVjK9iEK7Ce1o1dfRWLE5z2nIc';

    let supabase;
    if (window.supabase && window.supabase.createClient) {
        // SESSION-ONLY: Don't persist sessions
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });
    }
    
    console.log('⚠️ Header: Session-only mode active');

    document.addEventListener('DOMContentLoaded', () => {
        updateHeaderAuthState();
        setupProfileDropdown();
        setupLogoutHandlers();
    });

    async function updateHeaderAuthState() {
        const userData = getUserData();
        
        // Desktop header
        const loginBtn = document.getElementById('header-login-btn');
        const profileDropdown = document.getElementById('user-profile-dropdown');
        const userNameDisplay = document.getElementById('user-name-display');
        const profileMenuName = document.getElementById('profile-menu-name');
        const profileMenuEmail = document.getElementById('profile-menu-email');

        // Mobile menu
        const mobileLoginBtn = document.getElementById('mobile-login-btn');
        const mobileProfileLink = document.getElementById('mobile-profile-link');
        const mobileLogoutBtn = document.getElementById('mobile-logout-btn');

        if (userData && userData.authenticated) {
            // User is logged in
            const displayName = userData.name || userData.email?.split('@')[0] || 'User';
            
            // Desktop
            if (loginBtn) loginBtn.style.display = 'none';
            if (profileDropdown) profileDropdown.style.display = 'block';
            if (userNameDisplay) userNameDisplay.textContent = displayName;
            if (profileMenuName) profileMenuName.textContent = userData.name || displayName;
            if (profileMenuEmail) profileMenuEmail.textContent = userData.email || '';

            // Mobile
            if (mobileLoginBtn) mobileLoginBtn.style.display = 'none';
            if (mobileProfileLink) mobileProfileLink.style.display = 'block';
            if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'block';
        } else {
            // User is not logged in
            
            // Desktop
            if (loginBtn) loginBtn.style.display = 'block';
            if (profileDropdown) profileDropdown.style.display = 'none';

            // Mobile
            if (mobileLoginBtn) mobileLoginBtn.style.display = 'block';
            if (mobileProfileLink) mobileProfileLink.style.display = 'none';
            if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'none';
        }
    }

    function getUserData() {
        // SESSION-ONLY: Only check sessionStorage (not localStorage)
        const sessionData = sessionStorage.getItem('interviewai_user');

        if (sessionData) {
            try {
                return JSON.parse(sessionData);
            } catch (e) {
                return null;
            }
        }

        return null;
    }

    function setupProfileDropdown() {
        const profileTrigger = document.getElementById('profile-trigger');
        const profileDropdown = document.getElementById('user-profile-dropdown');

        if (!profileTrigger || !profileDropdown) {
            return;
        }

        // Toggle dropdown on click
        profileTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!profileDropdown.contains(e.target)) {
                profileDropdown.classList.remove('active');
            }
        });

        // Close dropdown on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                profileDropdown.classList.remove('active');
            }
        });
    }

    function setupLogoutHandlers() {
        const logoutBtn = document.getElementById('logout-btn');
        const mobileLogoutBtn = document.getElementById('mobile-logout-btn');

        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await handleLogout();
            });
        }

        if (mobileLogoutBtn) {
            mobileLogoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await handleLogout();
            });
        }
    }

    async function handleLogout() {
        try {
            // Sign out from Supabase if available
            if (supabase) {
                await supabase.auth.signOut();
            }

            // Clear local storage
            localStorage.removeItem('interviewai_user');
            sessionStorage.removeItem('interviewai_user');

            // Reload page to reset auth state
            window.location.reload();
        } catch (error) {
            console.error('Logout error:', error);
            // Still clear local data even if Supabase logout fails
            localStorage.removeItem('interviewai_user');
            sessionStorage.removeItem('interviewai_user');
            window.location.reload();
        }
    }

    // Export for use in other scripts
    window.updateHeaderAuthState = updateHeaderAuthState;
})();
