(function initAdminDashboard() {
    const tokenKey = 'interview-ai-admin-token';
    const tokenInput = document.getElementById('adminToken');
    const saveTokenBtn = document.getElementById('saveTokenBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const authPanel = document.getElementById('authPanel');
    const statusPanel = document.getElementById('statusPanel');
    const errorPanel = document.getElementById('errorPanel');
    const dashboard = document.getElementById('dashboard');

    function token() {
        return sessionStorage.getItem(tokenKey) || '';
    }

    function number(value) {
        return new Intl.NumberFormat().format(Number(value || 0));
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    function showError(message) {
        errorPanel.textContent = message;
        errorPanel.classList.remove('hidden');
    }

    function clearError() {
        errorPanel.textContent = '';
        errorPanel.classList.add('hidden');
    }

    async function loadStats() {
        clearError();
        const adminToken = token();
        if (!adminToken) {
            authPanel.classList.remove('hidden');
            dashboard.classList.add('hidden');
            statusPanel.classList.add('hidden');
            return;
        }

        const response = await fetch('/api/admin-stats', {
            headers: {
                Authorization: `Bearer ${adminToken}`,
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            if (response.status === 401) {
                sessionStorage.removeItem(tokenKey);
                authPanel.classList.remove('hidden');
            }
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Failed to load stats (${response.status})`);
        }

        render(await response.json());
    }

    function render(stats) {
        authPanel.classList.add('hidden');
        dashboard.classList.remove('hidden');
        statusPanel.classList.remove('hidden');

        setText('downloadsTotal', number(stats.downloads?.total));
        setText('downloadsToday', `${number(stats.downloads?.today)} today, ${number(stats.downloads?.last7Days)} in 7 days`);
        setText('activeToday', number(stats.activeUsers?.todayUnique));
        setText('active7', `${number(stats.activeUsers?.last7DailyActive)} daily actives in 7 days`);
        setText('launchesTotal', number(stats.appLaunches?.total));
        setText('launchesToday', `${number(stats.appLaunches?.today)} today`);
        setText('sessionsTotal', number(stats.sessionsStarted?.total));
        setText('sessionsToday', `${number(stats.sessionsStarted?.today)} today`);

        const storage = stats.storage || {};
        setText('storageBadge', `${storage.type || 'unknown'}${storage.persistent ? '' : ' (not persistent)'}`);
        setText('updatedAt', `Updated ${new Date(stats.generatedAt).toLocaleString()}`);
        if (storage.warning) showError(storage.warning);

        renderTrend(stats);
        renderRecent(stats.recentEvents || []);
    }

    function renderTrend(stats) {
        const chart = document.getElementById('trendChart');
        const downloads = (stats.downloads?.byDay || []).slice(-14);
        const active = (stats.activeUsers?.byDay || []).slice(-14);
        const maxValue = Math.max(
            1,
            ...downloads.map((day) => Number(day.count || 0)),
            ...active.map((day) => Number(day.unique || 0)),
        );

        chart.innerHTML = downloads.map((day, index) => {
            const activeCount = Number(active[index]?.unique || 0);
            const downloadCount = Number(day.count || 0);
            const downloadHeight = Math.max(2, Math.round((downloadCount / maxValue) * 168));
            const activeHeight = Math.max(2, Math.round((activeCount / maxValue) * 168));
            const date = new Date(`${day.day}T00:00:00Z`);
            const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

            return `
                <div class="trend-day" title="${day.day}: ${downloadCount} downloads, ${activeCount} active installs">
                    <div class="bars">
                        <span class="bar downloads" style="height:${downloadHeight}px"></span>
                        <span class="bar active" style="height:${activeHeight}px"></span>
                    </div>
                    <label>${label}</label>
                </div>
            `;
        }).join('');
    }

    function renderRecent(events) {
        const tbody = document.getElementById('recentEvents');
        if (!events.length) {
            tbody.innerHTML = '<tr><td colspan="5">No events yet</td></tr>';
            return;
        }

        tbody.innerHTML = events.map((event) => {
            const metadata = event.metadata || {};
            return `
                <tr>
                    <td>${new Date(event.ts).toLocaleString()}</td>
                    <td>${event.event || ''}</td>
                    <td>${metadata.source || ''}</td>
                    <td>${metadata.platform || metadata.os || ''}</td>
                    <td>${metadata.version || metadata.appVersion || ''}</td>
                </tr>
            `;
        }).join('');
    }

    saveTokenBtn.addEventListener('click', () => {
        const value = tokenInput.value.trim();
        if (!value) return;
        sessionStorage.setItem(tokenKey, value);
        loadStats().catch((error) => showError(error.message));
    });

    tokenInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') saveTokenBtn.click();
    });

    refreshBtn.addEventListener('click', () => {
        loadStats().catch((error) => showError(error.message));
    });

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem(tokenKey);
        tokenInput.value = '';
        dashboard.classList.add('hidden');
        statusPanel.classList.add('hidden');
        authPanel.classList.remove('hidden');
        clearError();
    });

    if (token()) {
        loadStats().catch((error) => showError(error.message));
    }
})();
