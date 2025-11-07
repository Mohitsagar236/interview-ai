// Profile page functionality
(function initProfilePage() {
    if (window.__profilePageLoaded) {
        return;
    }
    window.__profilePageLoaded = true;

    const SUPABASE_URL = 'https://npdysfxewryqcmmztdxl.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZHlzZnhld3J5cWNtbXp0ZHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNzMyMjUsImV4cCI6MjA3Nzk0OTIyNX0.WsEnKex2VNpY-uKB5oVjK9iEK7Ce1o1dfRWLE5z2nIc';

    const supabaseLib = window.supabase;
    // SESSION-ONLY: Don't persist sessions
    const supabase = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false, // Don't persist session
            autoRefreshToken: false, // Don't auto-refresh
            detectSessionInUrl: false // Don't detect session in URL
        }
    });
    
    console.log('⚠️ SESSION-ONLY MODE: Login required on every visit');

    let userData = null;
    let subscriptionData = null;
    let usageData = null;

    document.addEventListener('DOMContentLoaded', async () => {
        await checkAuthAndLoadProfile();
        setupNavigation();
        setupLogout();
        setupThemeToggle();
        await loadActivationCode(); // Load desktop app activation code
    });

    async function checkAuthAndLoadProfile() {
        // Check authentication (session-only mode)
        userData = getUserData();

        if (!userData || !userData.authenticated) {
            // Not authenticated, redirect to login
            console.log('[Profile] No valid session found, redirecting to login');
            window.location.href = 'auth.html';
            return;
        }

        console.log('[Profile] User authenticated:', userData.email);

        // Load profile data
        await loadProfileData();
        await loadSubscriptionData();
        await loadUsageData();
    }

    function getUserData() {
        // SESSION-ONLY: Only check sessionStorage (not localStorage)
        const sessionData = sessionStorage.getItem('interviewai_user');

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
            'plus': 'Plus Plan',
            'advanced': 'Advanced Plan',
            'premium': 'Premium Plan',
            'pro': 'Pro Plan'
        };

        const planName = planNames[sub.plan_type] || sub.plan_type || 'Free Plan';
        const isPaid = sub.plan_type !== 'free';

        const planBadge = document.getElementById('plan-badge');
        const planNameEl = document.getElementById('plan-name');
        const planDesc = document.getElementById('plan-description');
        
        if (planBadge) planBadge.textContent = planName.replace(' Plan', '');
        if (planNameEl) planNameEl.textContent = planName;
        if (planDesc) planDesc.textContent = sub.description || 'Interview AI subscription';

        // Status
        const isActive = sub.status === 'active';
        const statusEl = document.getElementById('subscription-status');
        if (statusEl) {
            statusEl.innerHTML = `<span class="status-badge ${isActive ? 'active' : ''}">${sub.status || 'Active'}</span>`;
        }

        // Dates
        if (sub.start_date) {
            const startDate = new Date(sub.start_date);
            const startEl = document.getElementById('subscription-start');
            if (startEl) {
                startEl.textContent = startDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            }
        }

        if (sub.end_date) {
            const endDate = new Date(sub.end_date);
            const expiryElement = document.getElementById('subscription-expiry');
            if (expiryElement) {
                expiryElement.textContent = endDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            }
        } else {
            const expiryElement = document.getElementById('subscription-expiry');
            if (expiryElement) {
                expiryElement.textContent = isPaid ? 'Lifetime' : 'Never';
            }
        }

        // Update upgrade button
        const upgradeBtn = document.getElementById('upgrade-btn');
        if (isPaid && upgradeBtn) {
            upgradeBtn.style.display = 'none';
        }
    }

    function updateCreditsUI(sub) {
        const creditsTotal = sub.credits_total || 0;
        const creditsUsed = sub.credits_used || 0;
        const creditsRemaining = creditsTotal - creditsUsed;
        
        // Update credits display with null checks
        const creditsT = document.getElementById('credits-total');
        const creditsU = document.getElementById('credits-used');
        const creditsR = document.getElementById('credits-remaining');
        const creditsH = document.getElementById('credits-hours');
        
        if (creditsT) creditsT.textContent = creditsTotal;
        if (creditsU) creditsU.textContent = creditsUsed.toFixed(1);
        if (creditsR) creditsR.textContent = creditsRemaining.toFixed(1);
        if (creditsH) creditsH.textContent = creditsRemaining.toFixed(1);
        
        // Show/hide credits display based on whether user has credits
        const creditsDisplay = document.getElementById('credits-display');
        if (creditsDisplay) {
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
    }

    async function loadActivationCode() {
        const codeSection = document.getElementById('activation-code-section');
        if (!codeSection) return;

        try {
            // Check if user is logged in (session-only mode)
            if (!userData || !userData.authenticated) {
                console.error('[Activation] User not authenticated');
                codeSection.innerHTML = `
                    <div style="text-align: center; padding: 20px; opacity: 0.7;">
                        <p style="font-size: 14px; margin-bottom: 12px;">Please log in to generate an activation code</p>
                        <button onclick="window.location.href='auth.html'" style="padding: 10px 20px; background: rgba(255,255,255,0.2); border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 13px;">
                            <i class="fas fa-sign-in-alt"></i> Login
                        </button>
                    </div>
                `;
                return;
            }

            // Get session token from userData
            const sessionToken = userData.supabase_session?.access_token;
            
            if (!sessionToken) {
                console.error('[Activation] No access token found');
                codeSection.innerHTML = `
                    <div style="text-align: center; padding: 20px; opacity: 0.7;">
                        <p style="font-size: 14px; margin-bottom: 12px;">Session expired. Please log in again.</p>
                        <button onclick="window.location.href='auth.html'" style="padding: 10px 20px; background: rgba(255,255,255,0.2); border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 13px;">
                            <i class="fas fa-sign-in-alt"></i> Login
                        </button>
                    </div>
                `;
                return;
            }

            console.log('[Activation] Fetching activation code for user:', userData.email);

            // Fetch or generate activation code
            const response = await fetch('/api/activation?action=generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({ regenerate: false })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Server error: ${response.status}`);
            }

            if (result.success && result.code) {
                displayActivationCode(result);
            } else {
                throw new Error(result.error || 'Failed to generate code');
            }

        } catch (error) {
            console.error('Error loading activation code:', error);
            codeSection.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 24px; color: #fbbf24; margin-bottom: 12px;"></i>
                    <p style="font-size: 14px; opacity: 0.9;">Failed to load activation code</p>
                    <p style="font-size: 12px; opacity: 0.7; margin-top: 8px;">${error.message}</p>
                    <button onclick="location.reload()" style="margin-top: 12px; padding: 8px 16px; background: rgba(255,255,255,0.2); border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 13px;">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
        }
    }

    function displayActivationCode(data) {
        const codeSection = document.getElementById('activation-code-section');
        if (!codeSection) return;

        const code = data.code;
        const creditsTotal = data.creditsTotal || 0;
        const creditsUsed = data.creditsUsed || 0;
        const creditsRemaining = creditsTotal - creditsUsed;

        codeSection.innerHTML = `
            <div class="activation-code-display">
                <div style="background: rgba(255,255,255,0.15); border-radius: 8px; padding: 16px; margin-bottom: 12px;">
                    <div style="text-align: center;">
                        <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px; font-family: 'Courier New', monospace; margin-bottom: 12px;" id="activation-code-text">
                            ${code}
                        </div>
                        <button onclick="window.copyActivationCode('${code}')" style="padding: 10px 24px; background: rgba(255,255,255,0.9); color: #4f46e5; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s;">
                            <i class="fas fa-copy"></i> Copy Code
                        </button>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div style="background: rgba(255,255,255,0.1); border-radius: 6px; padding: 12px; text-align: center;">
                        <div style="font-size: 11px; opacity: 0.8; margin-bottom: 4px;">TOTAL CREDITS</div>
                        <div style="font-size: 20px; font-weight: 700;">${creditsTotal}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.1); border-radius: 6px; padding: 12px; text-align: center;">
                        <div style="font-size: 11px; opacity: 0.8; margin-bottom: 4px;">REMAINING</div>
                        <div style="font-size: 20px; font-weight: 700;">${creditsRemaining.toFixed(1)}</div>
                    </div>
                </div>

                <div style="display: flex; gap: 8px;">
                    <button onclick="window.regenerateActivationCode()" style="flex: 1; padding: 10px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; color: white; cursor: pointer; font-size: 13px; transition: all 0.2s;">
                        <i class="fas fa-sync-alt"></i> Regenerate
                    </button>
                    <button onclick="window.deactivateCode()" style="flex: 1; padding: 10px; background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4); border-radius: 6px; color: white; cursor: pointer; font-size: 13px; transition: all 0.2s;">
                        <i class="fas fa-ban"></i> Deactivate
                    </button>
                </div>
                
                <div style="margin-top: 12px;">
                    <button onclick="window.testActivationEndpoint(false)" style="width: 100%; padding: 10px; background: rgba(251,191,36,0.2); border: 1px solid rgba(251,191,36,0.4); border-radius: 6px; color: white; cursor: pointer; font-size: 13px; transition: all 0.2s;">
                        <i class="fas fa-bug"></i> Debug: Test Generate
                    </button>
                    <button onclick="window.testActivationEndpoint(true)" style="width: 100%; padding: 10px; margin-top: 8px; background: rgba(168,85,247,0.2); border: 1px solid rgba(168,85,247,0.4); border-radius: 6px; color: white; cursor: pointer; font-size: 13px; transition: all 0.2s;">
                        <i class="fas fa-sync-alt"></i> Debug: Test Regenerate
                    </button>
                    <div id="debug-output" style="margin-top: 8px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 6px; font-family: monospace; font-size: 11px; display: none; max-height: 200px; overflow-y: auto;"></div>
                </div>
            </div>
        `;
    }

    // Global functions for button actions
    window.copyActivationCode = function(code) {
        navigator.clipboard.writeText(code).then(() => {
            showMessage('✅ Activation code copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy:', err);
            showMessage('❌ Failed to copy code');
        });
    };

    window.regenerateActivationCode = async function() {
        if (!confirm('Are you sure you want to regenerate your activation code? The old code will stop working.')) {
            return;
        }

        const codeSection = document.getElementById('activation-code-section');
        codeSection.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px; opacity: 0.7;"></i>
                <p style="margin-top: 12px; font-size: 14px; opacity: 0.8;">Regenerating code...</p>
            </div>
        `;

        try {
            // Check if user is logged in (session-only mode)
            if (!userData || !userData.authenticated) {
                throw new Error('Session expired. Please log in again.');
            }

            // Get session token from userData
            const sessionToken = userData.supabase_session?.access_token;
            
            if (!sessionToken) {
                throw new Error('Session expired. Please log in again.');
            }
            
            const response = await fetch('/api/activation?action=generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({ regenerate: true })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Server error: ${response.status}`);
            }

            if (result.success && result.code) {
                displayActivationCode(result);
                showMessage('✅ New activation code generated!');
            } else {
                throw new Error(result.error || 'Failed to regenerate code');
            }

        } catch (error) {
            console.error('Error regenerating code:', error);
            console.error('Error details:', error.message);
            showMessage('❌ Failed to regenerate code: ' + error.message);
            
            // Show detailed error in the code section
            codeSection.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 24px; color: #fbbf24; margin-bottom: 12px;"></i>
                    <p style="font-size: 14px; opacity: 0.9;">Failed to regenerate activation code</p>
                    <p style="font-size: 12px; opacity: 0.7; margin-top: 8px;">${error.message}</p>
                    <button onclick="loadActivationCode()" style="margin-top: 12px; padding: 8px 16px; background: rgba(255,255,255,0.2); border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 13px;">
                        <i class="fas fa-redo"></i> Reload
                    </button>
                </div>
            `;
        }
    };

    window.deactivateCode = async function() {
        if (!confirm('Are you sure you want to deactivate your activation code? Your desktop app will stop working until you generate a new code.')) {
            return;
        }

        try {
            // Check if user is logged in (session-only mode)
            if (!userData || !userData.authenticated) {
                throw new Error('Session expired. Please log in again.');
            }

            // Get session token from userData
            const sessionToken = userData.supabase_session?.access_token;
            
            if (!sessionToken) {
                throw new Error('Session expired. Please log in again.');
            }
            
            const response = await fetch('/api/activation?action=deactivate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                }
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Server error: ${response.status}`);
            }

            if (result.success) {
                showMessage('✅ Activation code deactivated');
                await loadActivationCode();
            } else {
                throw new Error(result.error || 'Failed to deactivate code');
            }

        } catch (error) {
            console.error('Error deactivating code:', error);
            showMessage('❌ Failed to deactivate code');
        }
    };

    // Debug function to test activation endpoint
    window.testActivationEndpoint = async function(regenerate = false) {
        const debugOutput = document.getElementById('debug-output');
        debugOutput.style.display = 'block';
        debugOutput.innerHTML = `⏳ Testing ${regenerate ? 'REGENERATE' : 'GENERATE'} endpoint...\n`;

        try {
            // Check if user is logged in
            if (!userData || !userData.authenticated) {
                throw new Error('Not authenticated');
            }

            const sessionToken = userData.supabase_session?.access_token;
            
            if (!sessionToken) {
                throw new Error('No session token found');
            }

            debugOutput.innerHTML += `✓ Token found (${sessionToken.length} chars)\n`;
            debugOutput.innerHTML += `✓ User: ${userData.email}\n`;
            debugOutput.innerHTML += `✓ Regenerate: ${regenerate}\n`;
            debugOutput.innerHTML += `\n📡 Calling API...\n`;

            // Test the endpoint
            const response = await fetch('/api/activation?action=generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({ regenerate: regenerate })
            });

            const result = await response.json();

            debugOutput.innerHTML += `\n📊 Response Status: ${response.status}\n`;
            debugOutput.innerHTML += `📊 Response OK: ${response.ok}\n\n`;
            debugOutput.innerHTML += `📄 Response Body:\n`;
            debugOutput.innerHTML += JSON.stringify(result, null, 2);

            if (!response.ok) {
                debugOutput.innerHTML += `\n\n❌ ERROR DETECTED\n`;
                debugOutput.innerHTML += `Status: ${response.status}\n`;
                debugOutput.innerHTML += `Message: ${result.error || 'Unknown error'}\n`;
                if (result.details) {
                    debugOutput.innerHTML += `Details: ${result.details}\n`;
                }
            } else {
                debugOutput.innerHTML += `\n\n✅ SUCCESS!\n`;
            }

        } catch (error) {
            debugOutput.innerHTML += `\n\n❌ EXCEPTION:\n`;
            debugOutput.innerHTML += `${error.message}\n`;
            debugOutput.innerHTML += `\nStack:\n${error.stack}`;
        }
    };

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
