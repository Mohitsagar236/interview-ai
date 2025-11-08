/**
 * Electron Application Configuration
 * Manages environment-specific settings for development vs production
 */

const config = {
  development: {
    // Development mode uses local Python server
    serverUrl: 'ws://localhost:8765',
    useLocalServer: true,
    cloudMode: false,
    enableDevTools: true,
    logLevel: 'debug'
  },
  
  production: {
    // Production mode connects to cloud backend via custom domain
    // Using api.interviewai.space (custom domain avoids firewall blocks)
    // Koyeb automatically handles port routing, use standard wss:// (port 443)
    serverUrl: process.env.SERVER_URL || 'wss://api.interviewai.space',
    
    useLocalServer: false,
    cloudMode: true,
    enableDevTools: false,
    logLevel: 'info',
    
    // Optional: API key for cloud authentication
    // This would be generated per-user during account creation
    apiKey: process.env.API_KEY || null
  },
  
  // Test mode for CI/CD
  test: {
    serverUrl: 'ws://localhost:8765',
    useLocalServer: true,
    cloudMode: false,
    enableDevTools: true,
    logLevel: 'error'
  }
};

// Determine current environment
const env = process.env.NODE_ENV || 'development';

// Export the appropriate configuration
const currentConfig = config[env] || config.development;

console.log(`[CONFIG] Running in ${env} mode`);
console.log(`[CONFIG] Server URL: ${currentConfig.serverUrl}`);
console.log(`[CONFIG] Cloud Mode: ${currentConfig.cloudMode}`);

module.exports = currentConfig;
