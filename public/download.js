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

    // Download function - Uses proxy endpoint with direct GitHub fallback
    window.downloadApp = function(platform) {
        if (!platform) {
            showToast('Download not available for this platform yet');
            return;
        }

        // Show download toast
        showToast('Your download will begin shortly...');

        // Use our API endpoint which redirects to GitHub release
        const downloadUrl = `/api/download?platform=${platform}`;
        
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

        // Apply saved theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
        }
    }
})();
