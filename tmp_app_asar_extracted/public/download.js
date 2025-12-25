// Download page functionality
(function initDownloadPage() {
    if (window.__downloadPageLoaded) {
        return;
    }
    window.__downloadPageLoaded = true;

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        setupThemeToggle();
        detectPlatform();
    });

    // Download function - picks correct Windows arch and uses API endpoint
    window.downloadApp = function(platform) {
        if (!platform) {
            showToast('Download not available for this platform yet');
            return;
        }

        // Show download toast
        showToast('Your download will begin shortly...');

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

        // Use our API endpoint which streams from release
        const downloadUrl = `/api/download?platform=${platform}${archParam}`;
        
        // Create invisible link and trigger download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        
        // Clean up after a delay
        setTimeout(() => {
            document.body.removeChild(link);
        }, 100);

        // Track download
        trackDownload(platform);
    };

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
