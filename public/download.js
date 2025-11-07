// Download page functionality
(function initDownloadPage() {
    if (window.__downloadPageLoaded) {
        return;
    }
    window.__downloadPageLoaded = true;

    // Download URLs - Direct download links (no redirect)
    const DOWNLOAD_URLS = {
        windows: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/Interview%20AI%20Setup%200.1.0.exe',
        mac: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/Interview-AI-0.1.0.dmg',
        linux: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/interview-ai-0.1.0.AppImage'
    };

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        setupThemeToggle();
        detectPlatform();
    });

    // Download function
    window.downloadApp = function(platform) {
        const url = DOWNLOAD_URLS[platform];
        
        if (!url) {
            showToast('Download not available for this platform yet');
            return;
        }

        // Show download toast
        showToast('Your download will begin shortly...');

        // Trigger download with proper filename
        const link = document.createElement('a');
        link.href = url;
        link.download = url.split('/').pop(); // Extract filename from URL
        link.target = '_blank'; // Open in new tab as fallback
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Track download (optional)
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

        // Apply saved theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
        }
    }
})();
