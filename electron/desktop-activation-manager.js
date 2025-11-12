/**
 * Desktop App Activation Manager
 * Handles simple code-based authentication for desktop app
 * SESSION-ONLY: Activation required every time app starts
 * Credits are tracked per activation code and consumed on usage
 */

const https = require('https');
const http = require('http');
const { app } = require('electron');

class DesktopActivationManager {
    constructor() {
        // Session-only storage (clears on app restart)
        this.sessionData = null;
        
        // Use production API URL when app is packaged OR NODE_ENV is production
        const isProduction = app ? (app.isPackaged || process.env.NODE_ENV === 'production') : (process.env.NODE_ENV === 'production');
        this.apiBaseUrl = isProduction 
            ? 'https://interviewai.space' 
            : 'http://localhost:3000';
        
        console.log('[Activation] Session-only activation manager initialized');
        console.log('[Activation] API URL:', this.apiBaseUrl);
        console.log('[Activation] Is Packaged:', app ? app.isPackaged : false);
        console.log('[Activation] NODE_ENV:', process.env.NODE_ENV);
        console.log('[Activation] Using Production:', isProduction);
        console.log('[Activation] ⚠️  Activation required on every app launch');
    }

    /**
     * Check if desktop app is activated (has valid activation code in current session)
     */
    isActivated() {
        return !!(this.sessionData && this.sessionData.activationCode && this.sessionData.userId);
    }

    /**
     * Get stored user data (session only)
     */
    getUserData() {
        if (!this.sessionData) {
            return {
                userId: null,
                email: null,
                name: null,
                activationCode: null,
                creditsTotal: 0,
                creditsUsed: 0,
                creditsRemaining: 0,
                planType: 'free'
            };
        }
        
        return {
            userId: this.sessionData.userId,
            email: this.sessionData.email,
            name: this.sessionData.name,
            activationCode: this.sessionData.activationCode,
            creditsTotal: this.sessionData.creditsTotal || 0,
            creditsUsed: this.sessionData.creditsUsed || 0,
            creditsRemaining: this.sessionData.creditsRemaining || 0,
            planType: this.sessionData.planType || 'free'
        };
    }

    /**
     * Activate desktop app with activation code
     */
    async activate(activationCode, deviceInfo = {}) {
        try {
            // Normalize code
            const normalizedCode = activationCode.replace(/\s+/g, '').toUpperCase();
            
            console.log('[Activation] Attempting activation...');
            console.log('[Activation] API URL:', this.apiBaseUrl);
            console.log('[Activation] Code:', normalizedCode.substring(0, 4) + '...');

            // Validate code with backend
            const response = await this.makeRequest(
                `${this.apiBaseUrl}/api/activation?action=activate`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        code: normalizedCode,
                        deviceInfo: {
                            platform: process.platform,
                            hostname: require('os').hostname(),
                            ...deviceInfo
                        }
                    })
                }
            );

            console.log('[Activation] Server response:', response);

            if (!response.success) {
                const errorMsg = response.error || response.details || 'Activation failed';
                console.error('[Activation] Activation failed:', errorMsg);
                throw new Error(errorMsg);
            }

            // Check if code has credits remaining
            const creditsRemaining = response.credits.total - response.credits.used;
            if (creditsRemaining <= 0) {
                throw new Error('This activation code has no credits remaining. Please purchase more credits.');
            }

            // Store activation data IN MEMORY ONLY (session-only)
            this.sessionData = {
                activationCode: normalizedCode,
                userId: response.user.id,
                email: response.user.email,
                name: response.user.name,
                creditsTotal: response.credits.total,
                creditsUsed: response.credits.used,
                creditsRemaining: creditsRemaining,
                planType: response.planType,
                activatedAt: Date.now()
            };

            console.log('[Activation] ✅ Desktop app activated successfully for user:', response.user.email);
            console.log('[Activation] Credits: ${creditsRemaining} remaining (${response.credits.total} total)');

            return {
                success: true,
                user: response.user,
                credits: {
                    total: response.credits.total,
                    used: response.credits.used,
                    remaining: creditsRemaining
                },
                planType: response.planType
            };

        } catch (error) {
            console.error('[Activation] ❌ Activation error:', error);
            return {
                success: false,
                error: error.message || 'Activation failed'
            };
        }
    }

    /**
     * Deactivate and clear session data
     */
    deactivate() {
        this.sessionData = null;
        console.log('[Activation] Desktop app deactivated (session cleared)');
    }

    /**
     * Get user credits from API
     */
    async getCredits() {
        try {
            if (!this.sessionData || !this.sessionData.activationCode) {
                return {
                    success: false,
                    error: 'Not activated. Please enter activation code.'
                };
            }

            const activationCode = this.sessionData.activationCode;
            
            if (!activationCode) {
                throw new Error('Not activated');
            }

            const response = await this.makeRequest(
                `${this.apiBaseUrl}/api/activation?action=get-credits`,
                {
                    method: 'GET',
                    headers: {
                        'X-Activation-Code': activationCode
                    }
                }
            );

            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch credits');
            }

            // Check if credits are depleted
            const creditsRemaining = response.credits.total - response.credits.used;
            if (creditsRemaining <= 0) {
                console.log('[Activation] ⚠️ Credits depleted!');
                return {
                    success: true,
                    credits: {
                        total: response.credits.total,
                        used: response.credits.used,
                        remaining: 0
                    },
                    planType: response.planType,
                    depleted: true
                };
            }

            // Update session storage with latest data
            if (this.sessionData) {
                this.sessionData.creditsTotal = response.credits.total;
                this.sessionData.creditsUsed = response.credits.used;
                this.sessionData.creditsRemaining = creditsRemaining;
                this.sessionData.planType = response.planType;
            }

            return {
                success: true,
                credits: {
                    total: response.credits.total,
                    used: response.credits.used,
                    remaining: creditsRemaining
                },
                planType: response.planType
            };

        } catch (error) {
            console.error('[Activation] Error fetching credits:', error);
            
            // Return cached data if available
            if (this.sessionData) {
                return {
                    success: false,
                    error: error.message,
                    credits: {
                        total: this.sessionData.creditsTotal || 0,
                        used: this.sessionData.creditsUsed || 0,
                        remaining: this.sessionData.creditsRemaining || 0
                    },
                    cached: true
                };
            }
            
            return {
                success: false,
                error: error.message,
                credits: { total: 0, used: 0, remaining: 0 }
            };
        }
    }

    /**
     * Update credits used
     */
    async updateCredits(creditsUsed) {
        try {
            if (!this.sessionData || !this.sessionData.activationCode) {
                return {
                    success: false,
                    error: 'Not activated. Please enter activation code.'
                };
            }

            const activationCode = this.sessionData.activationCode;
            
            if (!activationCode) {
                throw new Error('Not activated');
            }

            const response = await this.makeRequest(
                `${this.apiBaseUrl}/api/activation?action=update-credits`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Activation-Code': activationCode
                    },
                    body: JSON.stringify({ creditsUsed })
                }
            );

            if (!response.success) {
                throw new Error(response.error || 'Failed to update credits');
            }

            // Check if credits are now depleted
            const creditsRemaining = response.credits.total - response.credits.used;

            // Update session storage
            if (this.sessionData) {
                this.sessionData.creditsUsed = response.credits.used;
                this.sessionData.creditsTotal = response.credits.total;
                this.sessionData.creditsRemaining = creditsRemaining;
            }

            console.log('[Activation] Credits updated: ${creditsUsed} used, ${creditsRemaining} remaining');

            // Warn if credits depleted
            if (creditsRemaining <= 0) {
                console.log('[Activation] ❌ CREDITS DEPLETED - Service will stop');
                return {
                    success: true,
                    credits: {
                        total: response.credits.total,
                        used: response.credits.used,
                        remaining: 0
                    },
                    depleted: true,
                    message: 'Credits depleted. Please purchase more credits to continue.'
                };
            }

            return {
                success: true,
                credits: {
                    total: response.credits.total,
                    used: response.credits.used,
                    remaining: creditsRemaining
                }
            };

        } catch (error) {
            console.error('[Activation] Error updating credits:', error);
            
            // Update session cache anyway
            if (this.sessionData) {
                this.sessionData.creditsUsed = creditsUsed;
            }
            
            return {
                success: false,
                error: error.message,
                cached: true
            };
        }
    }

    /**
     * Sync credits with server (get latest values)
     */
    async syncCredits() {
        return await this.getCredits();
    }

    /**
     * Make HTTP request (helper method)
     */
    makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const protocol = urlObj.protocol === 'https:' ? https : http;

            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: options.headers || {}
            };

            const req = protocol.request(requestOptions, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);
                        resolve(jsonData);
                    } catch (error) {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            });

            req.on('error', (error) => {
                console.error('[Activation] HTTP request error:', error);
                console.error('[Activation] URL:', url);
                console.error('[Activation] Error code:', error.code);
                reject(error);
            });

            if (options.body) {
                req.write(options.body);
            }

            req.end();
        });
    }

    /**
     * Get activation status and user info
     */
    getActivationStatus() {
        if (!this.isActivated()) {
            return {
                activated: false,
                message: 'Desktop app not activated'
            };
        }

        const userData = this.getUserData();
        const creditsRemaining = userData.creditsTotal - userData.creditsUsed;

        return {
            activated: true,
            user: {
                email: userData.email,
                name: userData.name
            },
            credits: {
                total: userData.creditsTotal,
                used: userData.creditsUsed,
                remaining: creditsRemaining
            },
            planType: userData.planType,
            activatedAt: this.store.get('activatedAt')
        };
    }
}

module.exports = DesktopActivationManager;
