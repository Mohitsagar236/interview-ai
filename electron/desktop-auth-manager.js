/**
 * Desktop App Authentication Manager
 * Handles login, API key storage, and credit synchronization
 */

const Store = require('electron-store');
const https = require('https');

class DesktopAuthManager {
    constructor() {
        this.store = new Store({
            name: 'auth-secure',
            encryptionKey: 'interview-ai-desktop-auth-key' // In production, use obfuscated/env key
        });
        
        this.apiBaseUrl = 'http://localhost:3000'; // Change to production URL when deployed
    }

    /**
     * Check if user is authenticated (has valid API key)
     */
    isAuthenticated() {
        const apiKey = this.store.get('apiKey');
        const userId = this.store.get('userId');
        return !!(apiKey && userId);
    }

    /**
     * Get stored user data
     */
    getUserData() {
        return {
            userId: this.store.get('userId'),
            email: this.store.get('email'),
            name: this.store.get('name'),
            apiKey: this.store.get('apiKey')
        };
    }

    /**
     * Login with Supabase credentials and get API key
     */
    async login(email, password, supabaseUrl, supabaseAnonKey) {
        try {
            // Step 1: Authenticate with Supabase
            const authResponse = await this.makeRequest(
                `${supabaseUrl}/auth/v1/token?grant_type=password`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseAnonKey
                    },
                    body: JSON.stringify({
                        email,
                        password
                    })
                }
            );

            if (!authResponse.access_token) {
                throw new Error('Authentication failed');
            }

            const accessToken = authResponse.access_token;
            const user = authResponse.user;

            // Step 2: Get or generate API key for desktop app
            const apiKeyResponse = await this.makeRequest(
                `${this.apiBaseUrl}/api/generate-api-key`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({ regenerate: false })
                }
            );

            if (!apiKeyResponse.success) {
                throw new Error('Failed to get API key');
            }

            // Step 3: Store credentials securely
            const apiKey = apiKeyResponse.apiKey || apiKeyResponse.keyPrefix;
            
            this.store.set('userId', user.id);
            this.store.set('email', user.email);
            this.store.set('name', user.user_metadata?.name || user.email);
            this.store.set('apiKey', apiKey);
            this.store.set('loginTimestamp', Date.now());

            console.log('[Auth] Login successful for user:', user.email);

            return {
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.user_metadata?.name || user.email
                },
                newApiKey: !!apiKeyResponse.apiKey // true if new key was generated
            };

        } catch (error) {
            console.error('[Auth] Login error:', error);
            return {
                success: false,
                error: error.message || 'Login failed'
            };
        }
    }

    /**
     * Logout and clear stored data
     */
    logout() {
        this.store.clear();
        console.log('[Auth] User logged out');
    }

    /**
     * Get user credits from API
     */
    async getCredits() {
        try {
            const apiKey = this.store.get('apiKey');
            
            if (!apiKey) {
                throw new Error('Not authenticated');
            }

            const response = await this.makeRequest(
                `${this.apiBaseUrl}/api/get-credits`,
                {
                    method: 'GET',
                    headers: {
                        'X-API-Key': apiKey
                    }
                }
            );

            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch credits');
            }

            return {
                success: true,
                credits: response.credits
            };

        } catch (error) {
            console.error('[Auth] Get credits error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update credits used on server
     */
    async updateCredits(creditsUsed) {
        try {
            const apiKey = this.store.get('apiKey');
            
            if (!apiKey) {
                throw new Error('Not authenticated');
            }

            const response = await this.makeRequest(
                `${this.apiBaseUrl}/api/update-credits`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': apiKey
                    },
                    body: JSON.stringify({ creditsUsed })
                }
            );

            if (!response.success) {
                throw new Error(response.error || 'Failed to update credits');
            }

            return {
                success: true,
                credits: response.credits
            };

        } catch (error) {
            console.error('[Auth] Update credits error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate stored API key
     */
    async validateApiKey() {
        try {
            const apiKey = this.store.get('apiKey');
            
            if (!apiKey) {
                return { valid: false, error: 'No API key stored' };
            }

            const response = await this.makeRequest(
                `${this.apiBaseUrl}/api/validate-key`,
                {
                    method: 'GET',
                    headers: {
                        'X-API-Key': apiKey
                    }
                }
            );

            return {
                valid: response.success === true,
                userId: response.userId
            };

        } catch (error) {
            console.error('[Auth] Validate key error:', error);
            return {
                valid: false,
                error: error.message
            };
        }
    }

    /**
     * Helper method to make HTTP/HTTPS requests
     */
    makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const protocol = urlObj.protocol === 'https:' ? https : require('http');
            
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port,
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
                        const parsed = JSON.parse(data);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(parsed);
                        } else {
                            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
                        }
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (options.body) {
                req.write(options.body);
            }

            req.end();
        });
    }
}

module.exports = DesktopAuthManager;
