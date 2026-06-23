/**
 * Electron Application Configuration
 * Free BYOK local-first mode: always use local Python backend
 */

const { app } = require('electron');

const config = {
  development: {
    // Always use local server for free BYOK mode
    serverUrl: 'ws://localhost:8765',
    useLocalServer: true,
    cloudMode: false,
    enableDevTools: true,
    logLevel: 'debug'
  },
  
  production: {
    // Production also uses local server (BYOK - Bring Your Own Keys)
    serverUrl: 'ws://localhost:8765',
    useLocalServer: true,
    cloudMode: false,
    enableDevTools: false,
    logLevel: 'info',
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
const env = (app && app.isPackaged) ? 'production' : (process.env.NODE_ENV || 'development');

// Export the appropriate configuration
const currentConfig = config[env] || config.development;

console.log(`[CONFIG] Running in ${env} mode (local-first / BYOK)`);
console.log(`[CONFIG] Is Packaged: ${app && app.isPackaged}`);
console.log(`[CONFIG] Server URL: ${currentConfig.serverUrl}`);
console.log(`[CONFIG] Cloud Mode: ${currentConfig.cloudMode}`);

module.exports = currentConfig;
