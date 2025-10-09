const { contextBridge, ipcRenderer } = require('electron');

// Enhanced preload script for the modern Interview AI Assistant
console.log('🔧 Enhanced preload script loading...');

contextBridge.exposeInMainWorld('electronAPI', {
  // Screen capture functionality
  captureScreen: () => {
    console.log('📸 Requesting screen capture via IPC...');
    return ipcRenderer.invoke('capture-screen');
  },
  
  // Windows native capture for restricted applications
  captureScreenWindows: (options) => {
    console.log('📸 Requesting Windows native capture via IPC...');
    return ipcRenderer.invoke('capture-screen-windows', options);
  },
  
  // List available windows for capture
  listWindows: () => {
    console.log('📋 Requesting window list via IPC...');
    return ipcRenderer.invoke('list-windows');
  },
  
  // Stealth mode toggle
  toggleStealth: () => {
    console.log('🥷 Toggling stealth mode via IPC...');
    return ipcRenderer.invoke('toggle-stealth');
  },
  
  // Audio functionality (for future use)
  sendAudioChunk: (chunk) => {
    ipcRenderer.send('audio-chunk', chunk);
  },
  
  // Toolbar helpers
  hideToolbar: () => {
    return ipcRenderer.invoke('toolbar-hide');
  },
  toggleToolbar: () => {
    return ipcRenderer.invoke('toolbar-toggle');
  },
  resizeToolbar: (height) => {
    return ipcRenderer.invoke('toolbar-resize', height);
  },
  resizeToolbarDimensions: (width, height) => {
    return ipcRenderer.invoke('toolbar-resize-dimensions', { width, height });
  },
  focusToolbar: () => ipcRenderer.invoke('toolbar-focus'),
  getServerPort: () => {
    return ipcRenderer.invoke('get-server-port');
  },
  // Explicitly start backend server if needed
  serverStart: () => {
    return ipcRenderer.invoke('server-start');
  },
  // Open external URLs (e.g., calendar)
  openExternal: (url) => {
    return ipcRenderer.invoke('open-external', url);
  },
  // Bring the main window to front (settings/profile)
  showMain: () => {
    return ipcRenderer.invoke('show-main');
  },
  // Navigate to a named section inside main/profile window (e.g., 'calendar')
  navigateSection: (section) => {
    return ipcRenderer.invoke('navigate-section', section);
  },
  // Profile persistence
  loadProfile: () => ipcRenderer.invoke('profile-load'),
  saveProfile: (data) => ipcRenderer.invoke('profile-save', data),
  // Connections
  loadConnections: () => ipcRenderer.invoke('connections-load'),
  setConnection: (provider, value) => ipcRenderer.invoke('connections-set', provider, value),
  // Resumes
  listResumes: () => ipcRenderer.invoke('resumes-list'),
  uploadResume: (file) => ipcRenderer.invoke('resumes-upload', file),
  deleteResume: (id) => ipcRenderer.invoke('resumes-delete', id),
  openResume: (id) => ipcRenderer.invoke('resumes-open', id),
  parseResume: (id) => ipcRenderer.invoke('resume-parse', id),
  searchResumes: (query, limit) => ipcRenderer.invoke('resume-search', query, limit),
  // Settings
  loadSettings: () => ipcRenderer.invoke('settings-load'),
  saveSettings: (patch) => ipcRenderer.invoke('settings-save', patch),
  // Interviews
  listInterviews: () => ipcRenderer.invoke('interviews-list'),
  createInterview: (payload) => ipcRenderer.invoke('interviews-create', payload),
  updateInterview: (id, patch) => ipcRenderer.invoke('interviews-update', id, patch),
  deleteInterview: (id) => ipcRenderer.invoke('interviews-delete', id),
  startInterviewSession: (id) => ipcRenderer.invoke('interview-start-session', id),
  endInterviewSession: (id, options) => ipcRenderer.invoke('interview-end-session', id, options),
  appendInterviewNote: (id, note) => ipcRenderer.invoke('interview-append-note', id, note),
  coachSuggest: (id, question) => ipcRenderer.invoke('interview-coach-suggest', { id, question }),
  // Dashboard
  getDashboardStats: () => ipcRenderer.invoke('dashboard-stats'),
  // Activity Feed
  listActivities: (limit) => ipcRenderer.invoke('activity-list', limit),
  onActivityUpdated: (callback) => { ipcRenderer.on('activity-updated', (_e, entry) => { try { callback(entry); } catch(err){ console.error('onActivityUpdated handler error', err); } }); },
  // Diagnostics
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  // Compact Bar Download
  downloadCompactBar: (type) => ipcRenderer.invoke('download-compact-bar', type),
  // Main Desktop App Download
  downloadMainApp: (options) => ipcRenderer.invoke('download-main-app', options || {}),
  
  // Event listeners for main process communications
  onQuickCaptureResult: (callback) => {
    ipcRenderer.on('quick-capture-result', (event, imageData) => {
      callback(imageData);
    });
  },
  
  onStealthToggled: (callback) => {
    ipcRenderer.on('stealth-toggled', (event, isActive) => {
      callback(isActive);
    });
  },
  onNavigateSection: (callback) => {
    ipcRenderer.on('navigate-section', (_event, section) => {
      try { callback(section); } catch (e) { console.error('onNavigateSection handler error', e); }
    });
  },
  onResumesUpdated: (callback) => {
    ipcRenderer.on('resumes-updated', () => { try { callback(); } catch (e) { console.error('onResumesUpdated handler error', e); } });
  },
  onSettingsUpdated: (callback) => {
    ipcRenderer.on('settings-updated', () => { try { callback(); } catch (e) { console.error('onSettingsUpdated handler error', e); } });
  },
  onInterviewsUpdated: (callback) => {
    ipcRenderer.on('interviews-updated', () => { try { callback(); } catch (e) { console.error('onInterviewsUpdated handler error', e); } });
  },
  onInterviewSessionTick: (callback) => {
    ipcRenderer.on('interview-session-tick', (_e, data) => { try { callback(data); } catch (err) { console.error('onInterviewSessionTick handler error', err); } });
  },
  onCoachUpdate: (callback) => { ipcRenderer.on('coach-update', (_e, data) => { try { callback(data); } catch (err){ console.error('onCoachUpdate handler error', err); } }); },
  onHeartbeat: (callback) => {
    ipcRenderer.on('app-heartbeat', (_e, data) => { try { callback(data); } catch (err) { console.error('onHeartbeat handler error', err); } });
  },
  
  // System information
  getSystemInfo: () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.versions
    };
  },
  
  // Development helpers
  isDevelopment: () => {
    return process.env.NODE_ENV === 'development';
  },
  
  // Utility functions
  log: (message) => {
    console.log(`[Renderer] ${message}`);
  },
  
  error: (message, error) => {
    console.error(`[Renderer Error] ${message}`, error);
  },
  listDesktopSources: (types) => ipcRenderer.invoke('desktop-sources', { types })
});

// Enhanced error handling and logging
window.addEventListener('error', (event) => {
  console.error('🚨 Unhandled error in renderer:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('🚨 Unhandled promise rejection:', event.reason);
});

// Performance monitoring (development only)
if (process.env.NODE_ENV === 'development') {
  // Monitor long-running tasks
  let performanceObserver;
  
  try {
    performanceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        if (entry.duration > 100) { // Log tasks longer than 100ms
          console.warn(`⚠️ Long task detected: ${entry.name} (${entry.duration.toFixed(2)}ms)`);
        }
      });
    });
    
    performanceObserver.observe({ entryTypes: ['longtask'] });
  } catch (e) {
    console.log('Performance monitoring not available');
  }
}

// Security enhancements
Object.freeze(contextBridge);
Object.freeze(ipcRenderer);

console.log('✅ Enhanced preload script loaded successfully');
console.log('🔧 Available APIs: captureScreen, toggleStealth, sendAudioChunk, system info, event listeners');
console.log('🛡️ Security: Context isolation enabled, APIs frozen');
