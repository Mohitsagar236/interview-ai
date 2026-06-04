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
    let supabase = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false, // Don't persist session
            autoRefreshToken: true, // Enable auto-refresh for session duration
            detectSessionInUrl: false // Don't detect session in URL
        }
    });
    
    console.log('⚠️ SESSION-ONLY MODE: Login required on every visit');

    let userData = null;
    let usageData = null;
    let companyBriefData = null;
    let resumeData = null;

    document.addEventListener('DOMContentLoaded', async () => {
        await checkAuthAndLoadProfile();
        setupNavigation();
        setupLogout();
        setupThemeToggle();
        await loadInterviewPrepData(); // Load company brief and resume
        setupInterviewPrepHandlers(); // Setup form handlers
        startSessionMonitor(); // Monitor and refresh session
    });

    // Monitor session and refresh if needed
    function startSessionMonitor() {
        // Check session every 30 seconds
        setInterval(async () => {
            const user = getUserData();
            if (!user || !user.supabase_session) {
                console.log('[Session] No session found, redirecting to login');
                window.location.href = 'auth.html';
                return;
            }

            // Check if token is about to expire (within 5 minutes)
            const session = user.supabase_session;
            if (session && session.expires_at) {
                const expiresAt = session.expires_at * 1000; // Convert to milliseconds
                const now = Date.now();
                const timeUntilExpiry = expiresAt - now;
                const fiveMinutes = 5 * 60 * 1000;

                if (timeUntilExpiry < fiveMinutes) {
                    console.log('[Session] Token expiring soon, refreshing...');
                    await refreshSession();
                }
            }
        }, 30000); // Check every 30 seconds
    }

    // Refresh the session
    async function refreshSession() {
        try {
            const user = getUserData();
            if (!user || !user.supabase_session) {
                throw new Error('No session to refresh');
            }

            // Set the session first
            const { data, error } = await supabase.auth.setSession({
                access_token: user.supabase_session.access_token,
                refresh_token: user.supabase_session.refresh_token
            });

            if (error) throw error;

            if (data.session) {
                console.log('[Session] Token refreshed successfully');
                // Update stored session
                user.supabase_session = data.session;
                user.timestamp = Date.now();
                sessionStorage.setItem('interviewai_user', JSON.stringify(user));
            }
        } catch (error) {
            console.error('[Session] Refresh failed:', error);
            // If refresh fails, redirect to login
            window.location.href = 'auth.html';
        }
    }

    // Ensure session is set before making API calls
    async function ensureSession() {
        const user = getUserData();
        if (!user || !user.supabase_session) {
            throw new Error('No session found');
        }

        // Set the session in Supabase client
        const { error } = await supabase.auth.setSession({
            access_token: user.supabase_session.access_token,
            refresh_token: user.supabase_session.refresh_token
        });

        if (error) {
            console.error('[Session] Failed to set session:', error);
            await refreshSession(); // Try to refresh
        }
    }

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

        // Ensure session is set in Supabase client
        try {
            await ensureSession();
            console.log('[Profile] Session restored in Supabase client');
        } catch (error) {
            console.error('[Profile] Failed to restore session:', error);
            window.location.href = 'auth.html';
            return;
        }

        // Load profile data
        await loadProfileData();
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
        const displayName = userData.name || 'User';
        document.getElementById('profile-name-main').textContent = displayName;
        document.getElementById('profile-email-main').textContent = userData.email || '';

        // Avatar initials
        const avatarEl = document.getElementById('profile-avatar-main');
        if (avatarEl) {
            const parts = displayName.trim().split(/\s+/);
            const initials = parts.length >= 2
                ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                : displayName.slice(0, 2).toUpperCase();
            avatarEl.textContent = initials;
        }

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
        const limits = getLimits();

        updateUsageMetric('sessions', usage.sessions_used || 0, limits.sessions);
        updateUsageMetric('minutes', usage.minutes_used || 0, limits.minutes);
        updateUsageMetric('responses', usage.responses_used || 0, limits.responses);
        updateUsageMetric('scans', usage.scans_used || 0, limits.scans);
    }

    function getLimits() {
        return { sessions: null, minutes: null, responses: null, scans: null };
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

        // Apply saved theme (default to dark)
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme !== 'light') {
            document.documentElement.classList.add('dark');
        }
    }

    // ============ INTERVIEW PREP FUNCTIONS ============

    async function loadInterviewPrepData() {
        await Promise.all([
            loadCompanyBrief(),
            loadResume()
        ]);
    }

    async function loadCompanyBrief() {
        try {
            const sessionToken = userData?.supabase_session?.access_token;
            if (!sessionToken) return;

            const response = await fetch('/api/profile-data?action=get-company', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                }
            });

            const result = await response.json();
            
            if (result.success && result.companyBrief) {
                companyBriefData = result.companyBrief;
                populateCompanyBriefForm(companyBriefData);
                updateCompanyBriefStatus(true);
            } else {
                updateCompanyBriefStatus(false);
            }
        } catch (error) {
            console.error('[Profile] Error loading company brief:', error);
            updateCompanyBriefStatus(false);
        }
    }

    function populateCompanyBriefForm(data) {
        if (!data) return;

        const nameInput = document.getElementById('company-name');
        const roleInput = document.getElementById('company-role');
        const websiteInput = document.getElementById('company-website');
        const overviewInput = document.getElementById('company-overview');
        const notesInput = document.getElementById('company-notes');

        if (nameInput) nameInput.value = data.company_name || '';
        if (roleInput) roleInput.value = data.company_role || '';
        if (websiteInput) websiteInput.value = data.company_website || '';
        if (overviewInput) overviewInput.value = data.company_overview || '';
        if (notesInput) notesInput.value = data.company_notes || '';
    }

    function updateCompanyBriefStatus(hasData) {
        const statusBadge = document.getElementById('company-brief-status');
        if (statusBadge) {
            if (hasData) {
                statusBadge.textContent = 'Saved';
                statusBadge.classList.add('active');
            } else {
                statusBadge.textContent = 'Not Set';
                statusBadge.classList.remove('active');
            }
        }
    }

    async function saveCompanyBrief(formData) {
        try {
            const sessionToken = userData?.supabase_session?.access_token;
            if (!sessionToken) {
                throw new Error('Session expired. Please log in again.');
            }

            const response = await fetch('/api/profile-data?action=save-company', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({
                    name: formData.get('companyName'),
                    role: formData.get('companyRole'),
                    website: formData.get('companyWebsite'),
                    overview: formData.get('companyOverview'),
                    notes: formData.get('companyNotes')
                })
            });

            const result = await response.json();

            if (result.success) {
                companyBriefData = result.companyBrief;
                updateCompanyBriefStatus(true);
                showMessage('✅ Company brief saved successfully!');
            } else {
                throw new Error(result.error || 'Failed to save company brief');
            }
        } catch (error) {
            console.error('[Profile] Error saving company brief:', error);
            showMessage('❌ ' + error.message);
        }
    }

    async function deleteCompanyBrief() {
        try {
            const sessionToken = userData?.supabase_session?.access_token;
            if (!sessionToken) {
                throw new Error('Session expired. Please log in again.');
            }

            const response = await fetch('/api/profile-data?action=delete-company', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                }
            });

            const result = await response.json();

            if (result.success) {
                companyBriefData = null;
                // Clear form
                const form = document.getElementById('company-brief-form');
                if (form) form.reset();
                updateCompanyBriefStatus(false);
                showMessage('✅ Company brief cleared!');
            } else {
                throw new Error(result.error || 'Failed to delete company brief');
            }
        } catch (error) {
            console.error('[Profile] Error deleting company brief:', error);
            showMessage('❌ ' + error.message);
        }
    }

    async function loadResume() {
        try {
            const sessionToken = userData?.supabase_session?.access_token;
            if (!sessionToken) return;

            const response = await fetch('/api/profile-data?action=get-resume', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                }
            });

            const result = await response.json();
            
            if (result.success && result.resume) {
                resumeData = result.resume;
                displayCurrentResume(resumeData);
                updateResumeStatus(true);
            } else {
                updateResumeStatus(false);
            }
        } catch (error) {
            console.error('[Profile] Error loading resume:', error);
            updateResumeStatus(false);
        }
    }

    function displayCurrentResume(data) {
        const uploadArea = document.getElementById('resume-upload-area');
        const currentResume = document.getElementById('current-resume');
        const resumeName = document.getElementById('resume-name');
        const resumeDate = document.getElementById('resume-date');
        const resumeIcon = document.getElementById('resume-icon');

        if (data) {
            if (uploadArea) uploadArea.style.display = 'none';
            if (currentResume) currentResume.style.display = 'flex';
            if (resumeName) resumeName.textContent = data.file_name;
            if (resumeDate) {
                const date = new Date(data.uploaded_at);
                resumeDate.textContent = 'Uploaded: ' + date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            }
            // Set icon based on file type
            if (resumeIcon) {
                if (data.file_type?.includes('pdf')) {
                    resumeIcon.className = 'fas fa-file-pdf';
                    resumeIcon.style.color = '#dc2626';
                } else if (data.file_type?.includes('word') || data.file_name?.endsWith('.doc') || data.file_name?.endsWith('.docx')) {
                    resumeIcon.className = 'fas fa-file-word';
                    resumeIcon.style.color = '#2563eb';
                } else {
                    resumeIcon.className = 'fas fa-file-alt';
                    resumeIcon.style.color = '#6b7280';
                }
            }
        } else {
            if (uploadArea) uploadArea.style.display = 'block';
            if (currentResume) currentResume.style.display = 'none';
        }
    }

    function updateResumeStatus(hasData) {
        const statusBadge = document.getElementById('resume-status');
        if (statusBadge) {
            if (hasData) {
                statusBadge.textContent = 'Uploaded';
                statusBadge.classList.add('active');
            } else {
                statusBadge.textContent = 'No Resume';
                statusBadge.classList.remove('active');
            }
        }
    }

    async function uploadResume(file) {
        try {
            const sessionToken = userData?.supabase_session?.access_token;
            if (!sessionToken) {
                throw new Error('Session expired. Please log in again.');
            }

            // Validate file size (10MB)
            if (file.size > 10 * 1024 * 1024) {
                throw new Error('File size exceeds 10MB limit');
            }

            showMessage('📤 Uploading resume...');

            // Convert file to base64
            const fileContent = await fileToBase64(file);

            // Try to extract text content (for AI context)
            let textContent = null;
            if (file.type === 'text/plain') {
                textContent = await file.text();
            }

            const response = await fetch('/api/profile-data?action=upload-resume', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({
                    fileName: file.name,
                    fileType: file.type,
                    fileSize: file.size,
                    fileContent: fileContent,
                    textContent: textContent
                })
            });

            const result = await response.json();

            if (result.success) {
                resumeData = result.resume;
                displayCurrentResume(resumeData);
                updateResumeStatus(true);
                showMessage('✅ Resume uploaded successfully!');
            } else {
                throw new Error(result.error || 'Failed to upload resume');
            }
        } catch (error) {
            console.error('[Profile] Error uploading resume:', error);
            showMessage('❌ ' + error.message);
        }
    }

    async function deleteResume() {
        try {
            const sessionToken = userData?.supabase_session?.access_token;
            if (!sessionToken) {
                throw new Error('Session expired. Please log in again.');
            }

            const response = await fetch('/api/profile-data?action=delete-resume', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                }
            });

            const result = await response.json();

            if (result.success) {
                resumeData = null;
                displayCurrentResume(null);
                updateResumeStatus(false);
                showMessage('✅ Resume deleted!');
            } else {
                throw new Error(result.error || 'Failed to delete resume');
            }
        } catch (error) {
            console.error('[Profile] Error deleting resume:', error);
            showMessage('❌ ' + error.message);
        }
    }

    async function viewResume() {
        try {
            const sessionToken = userData?.supabase_session?.access_token;
            if (!sessionToken) {
                throw new Error('Session expired. Please log in again.');
            }

            const response = await fetch('/api/profile-data?action=get-resume-content', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                }
            });

            const result = await response.json();

            if (result.success && result.fileContent) {
                // Create blob and open in new window
                const byteCharacters = atob(result.fileContent);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: result.fileType });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
            } else {
                throw new Error('Resume not found');
            }
        } catch (error) {
            console.error('[Profile] Error viewing resume:', error);
            showMessage('❌ ' + error.message);
        }
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    }

    function setupInterviewPrepHandlers() {
        // Company Brief Form
        const companyForm = document.getElementById('company-brief-form');
        const clearCompanyBtn = document.getElementById('clear-company-btn');

        if (companyForm) {
            companyForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(companyForm);
                await saveCompanyBrief(formData);
            });
        }

        if (clearCompanyBtn) {
            clearCompanyBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to clear the company brief?')) {
                    await deleteCompanyBrief();
                }
            });
        }

        // Resume Upload
        const uploadArea = document.getElementById('resume-upload-area');
        const fileInput = document.getElementById('resume-file-input');
        const deleteResumeBtn = document.getElementById('delete-resume-btn');
        const viewResumeBtn = document.getElementById('view-resume-btn');

        if (uploadArea && fileInput) {
            // Click to upload
            uploadArea.addEventListener('click', () => {
                fileInput.click();
            });

            // Drag and drop
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('dragover');
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    handleResumeFile(files[0]);
                }
            });

            // File input change
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (file) {
                    handleResumeFile(file);
                }
                e.target.value = ''; // Reset for same file selection
            });
        }

        if (deleteResumeBtn) {
            deleteResumeBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete your resume?')) {
                    await deleteResume();
                }
            });
        }

        if (viewResumeBtn) {
            viewResumeBtn.addEventListener('click', async () => {
                await viewResume();
            });
        }
    }

    function handleResumeFile(file) {
        // Validate file type
        const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
        const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];
        
        const isValidType = allowedTypes.includes(file.type) || allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
        
        if (!isValidType) {
            showMessage('❌ Invalid file type. Please upload PDF, DOC, DOCX, or TXT files.');
            return;
        }

        uploadResume(file);
    }

    // ============ END INTERVIEW PREP FUNCTIONS ============

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
