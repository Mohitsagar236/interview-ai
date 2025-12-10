/**
 * Vercel Speed Insights Client Integration for Electron App
 * 
 * This module initializes Vercel Speed Insights for the Interview AI desktop application.
 * Speed Insights tracks Core Web Vitals and performance metrics using injectSpeedInsights().
 * 
 * NOTE: This runs on the client side (Electron BrowserWindow) only.
 * 
 * Usage:
 * <script src="speed-insights-client.js"></script>
 * 
 * The script will automatically initialize Speed Insights when loaded.
 */

(function() {
    'use strict';

    /**
     * Initialize Vercel Speed Insights for Electron App using injectSpeedInsights()
     * This function sets up Speed Insights tracking for performance monitoring
     */
    function initializeSpeedInsights() {
        // Ensure we're running on the client side (browser context)
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            console.debug('Speed Insights: Skipped (not in browser context)');
            return false;
        }

        // Dynamically import injectSpeedInsights from @vercel/speed-insights
        try {
            // Use dynamic import to load the package
            import('@vercel/speed-insights').then(({ injectSpeedInsights }) => {
                // Call injectSpeedInsights to inject the tracking script
                const speedInsights = injectSpeedInsights({
                    debug: false,
                });

                if (speedInsights) {
                    console.debug('Speed Insights: Successfully initialized via injectSpeedInsights()');
                } else {
                    console.debug('Speed Insights: injectSpeedInsights() returned null');
                }

                // Track performance metrics
                if (window.performance && window.performance.getEntriesByType) {
                    setupPerformanceTracking();
                }
            }).catch((error) => {
                console.debug('Speed Insights: Failed to import @vercel/speed-insights:', error);
            });
        } catch (error) {
            console.debug('Speed Insights: Error during initialization:', error);
            return false;
        }

        return true;
    }

    /**
     * Setup performance tracking for Speed Insights
     */
    function setupPerformanceTracking() {
        // Track when the app becomes visible/hidden
        if (document.addEventListener) {
            document.addEventListener('visibilitychange', function() {
                const state = document.hidden ? 'hidden' : 'visible';
                console.debug(`Speed Insights: Page visibility changed to ${state}`);
            });
        }

        // Track page load performance
        window.addEventListener('load', function() {
            if (window.performance && window.performance.timing) {
                const timing = window.performance.timing;
                const pageLoadTime = timing.loadEventEnd - timing.navigationStart;
                console.debug(`Speed Insights: Page load time: ${pageLoadTime}ms`);
            }
        });

        // Monitor Core Web Vitals if PerformanceObserver is available
        if ('PerformanceObserver' in window) {
            try {
                setupWebVitalsObservers();
            } catch (error) {
                console.debug('Speed Insights: Error setting up performance observers:', error);
            }
        }
    }

    /**
     * Setup observers for Core Web Vitals
     */
    function setupWebVitalsObservers() {
        // Monitor Largest Contentful Paint (LCP)
        try {
            const lcpObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];
                const lcp = lastEntry.renderTime || lastEntry.loadTime;
                console.debug(`Speed Insights: LCP = ${lcp}ms`);
            });
            lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        } catch (e) {
            console.debug('Speed Insights: LCP observer not supported');
        }

        // Monitor Cumulative Layout Shift (CLS)
        try {
            const clsObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                let clsValue = 0;
                entries.forEach((entry) => {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                    }
                });
                console.debug(`Speed Insights: CLS = ${clsValue.toFixed(3)}`);
            });
            clsObserver.observe({ entryTypes: ['layout-shift'] });
        } catch (e) {
            console.debug('Speed Insights: CLS observer not supported');
        }

        // Monitor First Input Delay (FID) / Interaction to Next Paint (INP)
        try {
            const interactionObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach((entry) => {
                    console.debug(`Speed Insights: Interaction duration = ${entry.processingDuration || entry.duration}ms`);
                });
            });
            // Try INP first (newer metric), fall back to first-input
            interactionObserver.observe({ entryTypes: ['event'] });
        } catch (e) {
            try {
                const fidObserver = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    entries.forEach((entry) => {
                        console.debug(`Speed Insights: FID = ${entry.processingDuration}ms`);
                    });
                });
                fidObserver.observe({ entryTypes: ['first-input'] });
            } catch (error) {
                console.debug('Speed Insights: FID observer not supported');
            }
        }
    }

    /**
     * Public API for accessing Speed Insights
     */
    window.SpeedInsightsClient = {
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
            return !!(window.si || window.siq);
        },

        /**
         * Get initialization status
         * @returns {object} status information
         */
        getStatus: function() {
            return {
                available: !!window.si || !!window.siq,
                queue: window.siq || [],
                hasPerformanceAPI: !!window.performance,
                hasPerformanceObserver: 'PerformanceObserver' in window
            };
        }
    };

    // Initialize Speed Insights when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            // Give script tag time to load
            setTimeout(initializeSpeedInsights, 100);
        });
    } else {
        // DOM is already ready
        setTimeout(initializeSpeedInsights, 100);
    }

    // Also try to initialize after a longer delay to ensure script is loaded
    setTimeout(initializeSpeedInsights, 1000);

})();
