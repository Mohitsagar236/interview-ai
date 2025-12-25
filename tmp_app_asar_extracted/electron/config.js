/**
 * Electron Application Configuration
 * Manages environment-specific settings for development vs production
 */

const { app } = require('electron');

const config = {
  development: {
    // Development mode: Use local server by default for development
    // Set USE_LOCAL_SERVER=false to test with cloud backend
    serverUrl: process.env.USE_LOCAL_SERVER === 'false' ? 'wss://api.interviewai.space' : 'ws://localhost:8765',
    useLocalServer: process.env.USE_LOCAL_SERVER !== 'false',
    cloudMode: process.env.USE_LOCAL_SERVER === 'false',
    enableDevTools: true,
    logLevel: 'debug'
  },
  
  production: {
    // Production mode ALWAYS connects to cloud backend via Koyeb
    // Koyeb automatically handles port routing and SSL/TLS termination
    serverUrl: 'wss://api.interviewai.space',
    
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
// IMPORTANT: When packaged, always use production mode (cloud backend)
const env = (app && app.isPackaged) ? 'production' : (process.env.NODE_ENV || 'development');

// Export the appropriate configuration
const currentConfig = config[env] || config.development;

console.log(`[CONFIG] Running in ${env} mode`);
console.log(`[CONFIG] Is Packaged: ${app && app.isPackaged}`);
console.log(`[CONFIG] Server URL: ${currentConfig.serverUrl}`);
console.log(`[CONFIG] Cloud Mode: ${currentConfig.cloudMode}`);

module.exports = currentConfig;
