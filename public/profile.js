// Profile page functionality
(function initProfilePage() {
    if (window.__profilePageLoaded) {
        return;
    }
    window.__profilePageLoaded = true;

    const SUPABASE_URL = 'https://npdysfxewryqcmmztdxl.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZHlzZnhld3J5cWNtbXp0ZHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNzMyMjUsImV4cCI6MjA3Nzk0OTIyNX0.WsEnKex2VNpY-uKB5oVjK9iEK7Ce1o1dfRWLE5z2nIc';

    const supabaseLib = window.supabase;
    const supabase = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let userData = null;
    let subscriptionData = null;
    let usageData = null;

    document.addEventListener('DOMContentLoaded', async () => {
        await checkAuthAndLoadProfile();
        setupNavigation();
        setupLogout();
        setupThemeToggle();
    });

    async function checkAuthAndLoadProfile() {
        // Check authentication
        userData = getUserData();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session && !userData) {
            // Not authenticated, redirect to login
            window.location.href = 'auth.html';
            return;
        }

        // Load profile data
        await loadProfileData();
        await loadSubscriptionData();
        await loadUsageData();
    }

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

    async function loadProfileData() {
        if (!userData) {
            return;
        }

        // Update sidebar
        document.getElementById('profile-name-main').textContent = userData.name || 'User';
        document.getElementById('profile-email-main').textContent = userData.email || '';

        // Update account section
        document.getElementById('account-name').textContent = userData.name || 'N/A';
        document.getElementById('account-email').textContent = userData.email || 'N/A';
        document.getElementById('account-phone').textContent = userData.phone || 'N/A';

        // Format creation date
        if (userData.timestamp) {
            const date = new Date(userData.timestamp);
            document.getElementById('account-created').textContent = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } else {
            document.getElementById('account-created').textContent = 'N/A';
        }

        // Try to get additional profile data from Supabase
        if (userData.id) {
            try {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userData.id)
                    .limit(1);

                const profile = Array.isArray(profileData) ? profileData[0] : profileData;

                if (profile) {
                    if (profile.created_at) {
                        const date = new Date(profile.created_at);
                        document.getElementById('account-created').textContent = date.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        });
                    }
                }
            } catch (error) {
                console.error('Error loading profile:', error);
            }
        }
    }

    async function loadSubscriptionData() {
        if (!userData || !userData.id) {
            setDefaultSubscription();
            return;
        }

        try {
            // Try to fetch subscription data from Supabase
            const { data: subData } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', userData.id)
                .limit(1);

            subscriptionData = Array.isArray(subData) && subData.length > 0 ? subData[0] : null;

            if (subscriptionData) {
                updateSubscriptionUI(subscriptionData);
                updateCreditsUI(subscriptionData);
            } else {
                setDefaultSubscription();
            }
        } catch (error) {
            console.error('Error loading subscription:', error);
            setDefaultSubscription();
        }
    }

    function setDefaultSubscription() {
        document.getElementById('plan-badge').textContent = 'Free';
        document.getElementById('plan-name').textContent = 'Free Plan';
        document.getElementById('plan-description').textContent = 'Limited features with basic interview support';
        document.getElementById('subscription-status').innerHTML = '<span class="status-badge active">Active</span>';
        document.getElementById('subscription-start').textContent = 'N/A';
        document.getElementById('subscription-expiry').textContent = 'Never';
        
        // Set default credits
        updateCreditsUI({ credits_total: 0, credits_used: 0 });
    }

    function updateSubscriptionUI(sub) {
        const planNames = {
            'free': 'Free Plan',
            'basic': 'Basic Plan',
            'premium': 'Premium Plan',
            'pro': 'Pro Plan'
        };

        const planName = planNames[sub.plan_type] || sub.plan_type || 'Free Plan';
        const isPaid = sub.plan_type !== 'free';

        document.getElementById('plan-badge').textContent = planName.replace(' Plan', '');
        document.getElementById('plan-name').textContent = planName;
        document.getElementById('plan-description').textContent = sub.description || 'Interview AI subscription';

        // Status
        const isActive = sub.status === 'active';
        document.getElementById('subscription-status').innerHTML = `<span class="status-badge ${isActive ? 'active' : ''}">${sub.status || 'Active'}</span>`;

        // Dates
        if (sub.start_date) {
            const startDate = new Date(sub.start_date);
            document.getElementById('subscription-start').textContent = startDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }

        if (sub.end_date) {
            const endDate = new Date(sub.end_date);
            document.getElementById('subscription-expiry').textContent = endDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } else {
            document.getElementById('subscription-expiry').textContent = isPaid ? 'Lifetime' : 'Never';
        }

        // Update upgrade button
        if (isPaid) {
            document.getElementById('upgrade-btn').style.display = 'none';
        }
    }

    function updateCreditsUI(sub) {
        const creditsTotal = sub.credits_total || 0;
        const creditsUsed = sub.credits_used || 0;
        const creditsRemaining = creditsTotal - creditsUsed;
        
        // Update credits display
        document.getElementById('credits-total').textContent = creditsTotal;
        document.getElementById('credits-used').textContent = creditsUsed.toFixed(1);
        document.getElementById('credits-remaining').textContent = creditsRemaining.toFixed(1);
        document.getElementById('credits-hours').textContent = creditsRemaining.toFixed(1);
        
        // Show/hide credits display based on whether user has credits
        const creditsDisplay = document.getElementById('credits-display');
        if (creditsTotal > 0) {
            creditsDisplay.style.display = 'block';
            
            // Update color based on remaining credits
            if (creditsRemaining <= 0) {
                creditsDisplay.style.background = 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)';
            } else if (creditsRemaining < 1) {
                creditsDisplay.style.background = 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)';
            } else {
                creditsDisplay.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            }
        } else {
            creditsDisplay.style.display = 'none';
        }
    }

    async function loadUsageData() {
        if (!userData || !userData.id) {
            setDefaultUsage();
            return;
        }

        try {
            // Try to fetch usage data from Supabase
            const { data: usage } = await supabase
                .from('usage_stats')
                .select('*')
                .eq('user_id', userData.id)
                .limit(1);

            usageData = Array.isArray(usage) && usage.length > 0 ? usage[0] : null;

            if (usageData) {
                updateUsageUI(usageData);
            } else {
                setDefaultUsage();
            }
        } catch (error) {
            console.error('Error loading usage:', error);
            setDefaultUsage();
        }
    }

    function setDefaultUsage() {
        updateUsageMetric('sessions', 0, null);
        updateUsageMetric('minutes', 0, null);
        updateUsageMetric('responses', 0, null);
        updateUsageMetric('scans', 0, null);
    }

    function updateUsageUI(usage) {
        // Determine limits based on subscription
        const limits = getLimits();

        updateUsageMetric('sessions', usage.sessions_used || 0, limits.sessions);
        updateUsageMetric('minutes', usage.minutes_used || 0, limits.minutes);
        updateUsageMetric('responses', usage.responses_used || 0, limits.responses);
        updateUsageMetric('scans', usage.scans_used || 0, limits.scans);
    }

    function getLimits() {
        const planType = subscriptionData?.plan_type || 'free';

        const limits = {
            'free': { sessions: 10, minutes: 60, responses: 100, scans: 5 },
            'basic': { sessions: 50, minutes: 300, responses: 500, scans: 20 },
            'premium': { sessions: null, minutes: null, responses: null, scans: null },
            'pro': { sessions: null, minutes: null, responses: null, scans: null }
        };

        return limits[planType] || limits.free;
    }

    function updateUsageMetric(type, used, limit) {
        const usedEl = document.getElementById(`${type}-used`);
        const limitEl = document.getElementById(`${type}-limit`);
        const progressEl = document.getElementById(`${type}-progress`);

        usedEl.textContent = used;
        limitEl.textContent = limit === null ? '∞' : limit;

        if (limit === null) {
            progressEl.style.width = '0%';
        } else {
            const percentage = Math.min((used / limit) * 100, 100);
            progressEl.style.width = `${percentage}%`;

            // Change color if nearing limit
            if (percentage >= 90) {
                progressEl.style.background = 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)';
            } else if (percentage >= 70) {
                progressEl.style.background = 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)';
            } else {
                progressEl.style.background = 'linear-gradient(90deg, #10b981 0%, #059669 100%)';
            }
        }
    }

    function setupNavigation() {
        const navItems = document.querySelectorAll('.profile-nav-item');
        const sections = document.querySelectorAll('.profile-section');

        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();

                const targetSection = item.dataset.section;

                // Update active nav item
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');

                // Show target section
                sections.forEach(section => {
                    if (section.id === `${targetSection}-section`) {
                        section.classList.add('active');
                    } else {
                        section.classList.remove('active');
                    }
                });
            });
        });
    }

    function setupLogout() {
        const logoutBtn = document.getElementById('profile-logout-btn');

        logoutBtn?.addEventListener('click', async () => {
            try {
                await supabase.auth.signOut();
                localStorage.removeItem('interviewai_user');
                sessionStorage.removeItem('interviewai_user');

                showMessage('Logged out successfully');

                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1000);
            } catch (error) {
                console.error('Logout error:', error);
                showMessage('Error logging out. Please try again.');
            }
        });
    }

    function setupThemeToggle() {
        const themeToggle = document.querySelector('.theme-toggle');

        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                document.documentElement.classList.toggle('dark');
                localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
            });
        }

        // Apply saved theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
        }
    }

    function showMessage(message) {
        const toast = document.getElementById('message-toast');
        if (!toast) {
            return;
        }

        toast.textContent = message;
        toast.classList.remove('hidden');

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }
})();
