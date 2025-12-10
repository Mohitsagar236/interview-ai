/**
 * Vercel Speed Insights Integration for Node.js Serverless Functions
 * 
 * This module provides utility functions to integrate Vercel Speed Insights
 * into Node.js API endpoints for performance monitoring.
 * 
 * Usage:
 * const { setupSpeedInsights } = require('./speed-insights');
 * 
 * setupSpeedInsights(req, res);
 */

/**
 * Configure Speed Insights headers for API responses
 * This helps Vercel's Speed Insights track performance metrics
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function setupSpeedInsights(req, res) {
    // Add timing headers to help with performance monitoring
    const startTime = Date.now();
    
    // Store original send function
    const originalSend = res.send;
    
    // Override send to add performance metrics
    res.send = function(data) {
        const duration = Date.now() - startTime;
        
        // Add performance timing header
        res.setHeader('Server-Timing', `total;dur=${duration}`);
        
        // Call original send
        return originalSend.call(this, data);
    };
}

/**
 * Log performance metrics for Speed Insights
 * Useful for tracking slow or problematic endpoints
 * 
 * @param {string} endpoint - The API endpoint being called
 * @param {number} duration - Duration in milliseconds
 * @param {number} statusCode - HTTP status code
 * @param {boolean} logAll - Whether to log all requests (default: false for production)
 */
function logPerformanceMetric(endpoint, duration, statusCode, logAll = false) {
    // Only log in development or for slow requests
    const isDev = process.env.NODE_ENV !== 'production';
    const isSlow = duration > 1000; // Requests taking more than 1 second
    
    if (isDev || isSlow || logAll) {
        const level = isSlow ? 'warn' : 'debug';
        console.log(`[Speed Insights] ${level.toUpperCase()} - ${endpoint}: ${duration}ms (${statusCode})`);
    }
}

/**
 * Wrap an async handler function with Speed Insights monitoring
 * 
 * @param {Function} handler - The async handler function
 * @returns {Function} Wrapped handler with monitoring
 */
function withSpeedInsights(handler) {
    return async (req, res) => {
        const startTime = Date.now();
        const endpoint = `${req.method} ${req.url}`;
        
        try {
            setupSpeedInsights(req, res);
            const result = await handler(req, res);
            
            const duration = Date.now() - startTime;
            logPerformanceMetric(endpoint, duration, res.statusCode || 200);
            
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            logPerformanceMetric(endpoint, duration, 500, true);
            throw error;
        }
    };
}

module.exports = {
    setupSpeedInsights,
    logPerformanceMetric,
    withSpeedInsights
};
