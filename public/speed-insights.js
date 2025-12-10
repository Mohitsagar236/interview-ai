/**
 * Vercel Speed Insights Initialization Module
 * 
 * This module integrates Vercel Speed Insights using @vercel/speed-insights package.
 * Speed Insights tracks Core Web Vitals and other performance metrics on your site.
 * 
 * For plain HTML sites:
 * - The script tag (/_vercel/speed-insights/script.js) is loaded in the HTML
 * - This module enhances initialization with additional performance monitoring
 * 
 * Usage:
 * <script src="speed-insights.js"></script>
 * 
 * The script will automatically initialize Speed Insights when loaded.
 * 
 * NOTE: Speed Insights must run on the client side only.
 */

(function() {
    'use strict';

    /**
     * Initialize Vercel Speed Insights
     * This function sets up Speed Insights and verifies it's working
     */
    function initializeSpeedInsights() {
        // Ensure we're running on the client side (not server/Node.js)
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            console.debug('Speed Insights skipped: Not running in browser environment');
            return false;
        }

        // Check if the Speed Insights script tag is loaded
        if (!window.si) {
            console.warn('Vercel Speed Insights script tag not found. Make sure /_vercel/speed-insights/script.js is loaded in the HTML.');
            return false;
        }

        // Log successful initialization
        console.debug('Vercel Speed Insights initialized successfully');

        // Optional: Set up performance monitoring
        if (window.performance && window.performance.getEntriesByType) {
            // Performance monitoring is available
            setupPerformanceMonitoring();
        }

        return true;
    }

    /**
     * Set up additional performance monitoring
     * This tracks custom metrics and logs them
     */
    function setupPerformanceMonitoring() {
        // Track page visibility changes
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                console.debug('Page visibility: hidden');
            } else {
                console.debug('Page visibility: visible');
            }
        });

        // Log navigation timing when page is fully loaded
        window.addEventListener('load', function() {
            if (window.performance && window.performance.timing) {
                const timing = window.performance.timing;
                const pageLoadTime = timing.loadEventEnd - timing.navigationStart;
                console.debug(`Page load time: ${pageLoadTime}ms`);
            }
        });

        // Monitor Core Web Vitals if PerformanceObserver is available
        if ('PerformanceObserver' in window) {
            try {
                // Monitor Largest Contentful Paint (LCP)
                const lcpObserver = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    const lastEntry = entries[entries.length - 1];
                    console.debug(`LCP: ${lastEntry.renderTime || lastEntry.loadTime}ms`);
                });
                lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

                // Monitor First Input Delay (FID) - deprecated in favor of INP
                const fidObserver = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    entries.forEach((entry) => {
                        console.debug(`FID: ${entry.processingDuration}ms`);
                    });
                });
                fidObserver.observe({ entryTypes: ['first-input'] });

                // Monitor Cumulative Layout Shift (CLS)
                const clsObserver = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    entries.forEach((entry) => {
                        console.debug(`CLS: ${entry.value}`);
                    });
                });
                clsObserver.observe({ entryTypes: ['layout-shift'] });

                // Monitor Interaction to Next Paint (INP) - newer metric
                const inpObserver = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    entries.forEach((entry) => {
                        console.debug(`INP: ${entry.duration}ms`);
                    });
                });
                try {
                    inpObserver.observe({ entryTypes: ['event'] });
                } catch (e) {
                    // INP might not be supported in all browsers
                }
            } catch (error) {
                console.debug('Error setting up performance observers:', error);
            }
        }
    }

    /**
     * Public API for accessing Speed Insights
     */
    window.SpeedInsights = {
        /**
         * Initialize Speed Insights
         * @returns {boolean} true if successfully initialized, false otherwise
         */
        init: function() {
            return initializeSpeedInsights();
        },

        /**
         * Check if Speed Insights is available
         * @returns {boolean} true if Speed Insights is available
         */
        isAvailable: function() {
            return !!window.si;
        },

        /**
         * Get the Speed Insights queue (for advanced usage)
         * @returns {Array} the Speed Insights queue
         */
        getQueue: function() {
            return window.siq || [];
        }
    };

    // Initialize Speed Insights when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initializeSpeedInsights();
        });
    } else {
        // DOM is already ready
        initializeSpeedInsights();
    }

})();
