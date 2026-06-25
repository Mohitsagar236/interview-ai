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
  getStealthStatus: () => ipcRenderer.invoke('get-stealth-status'),
  
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
  // NEW: Get application configuration (cloud mode, server URL, etc.)
  getConfig: () => {
    return ipcRenderer.invoke('get-config');
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
  resume: {
    getCurrent: () => ipcRenderer.invoke('resume-current:get'),
    setCurrent: (payload) => ipcRenderer.invoke('resume-current:set', payload),
    clearCurrent: (options) => ipcRenderer.invoke('resume-current:clear', options || {}),
    onCurrentUpdated: (callback) => {
      ipcRenderer.on('resume-current-updated', (_event, resume) => {
        try { callback(resume); } catch (e) { console.error('onCurrentResumeUpdated handler error', e); }
      });
    },
    onCurrentCleared: (callback) => {
      ipcRenderer.on('resume-current-cleared', () => {
        try { callback(); } catch (e) { console.error('onCurrentResumeCleared handler error', e); }
      });
    },
  },
  // Settings
  loadSettings: () => ipcRenderer.invoke('settings-load'),
  saveSettings: (patch) => ipcRenderer.invoke('settings-save', patch),
  // Server control
  restartServer: () => ipcRenderer.invoke('server-restart'),
  // Interviews
  listInterviews: () => ipcRenderer.invoke('interviews-list'),
  createInterview: (payload) => ipcRenderer.invoke('interviews-create', payload),
  updateInterview: (id, patch) => ipcRenderer.invoke('interviews-update', id, patch),
  deleteInterview: (id) => ipcRenderer.invoke('interviews-delete', id),
  startInterviewSession: (id) => ipcRenderer.invoke('interview-start-session', id),
  endInterviewSession: (id, options) => ipcRenderer.invoke('interview-end-session', id, options),
  appendInterviewNote: (id, note) => ipcRenderer.invoke('interview-append-note', id, note),
  coachSuggest: (id, question) => ipcRenderer.invoke('interview-coach-suggest', { id, question }),
  // Activity Feed
  listActivities: (limit) => ipcRenderer.invoke('activity-list', limit),
  onActivityUpdated: (callback) => { ipcRenderer.on('activity-updated', (_e, entry) => { try { callback(entry); } catch(err){ console.error('onActivityUpdated handler error', err); } }); },
  // Diagnostics
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  // Compact Bar Download
  downloadCompactBar: (type) => ipcRenderer.invoke('download-compact-bar', type),
  // Main Desktop App Download
  downloadMainApp: (options) => ipcRenderer.invoke('download-main-app', options || {}),
  
  // Settings (BYOK — local encrypted storage)
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    saveApiKey: (provider, key) => ipcRenderer.invoke('settings:save-api-key', provider, key),
    getApiKey: (provider) => ipcRenderer.invoke('settings:get-api-key', provider),
    clearAll: () => ipcRenderer.invoke('settings:clear-all'),
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    hasAiKey: () => ipcRenderer.invoke('settings:has-ai-key'),
    hasDeepgramKey: () => ipcRenderer.invoke('settings:has-deepgram-key'),
    openWindow: () => ipcRenderer.invoke('settings:open-window'),
  },
  onboardingComplete: () => ipcRenderer.invoke('onboarding:complete'),

  // Claude Account — direct API key import
  claudeAccount: {
    signIn:    (apiKey) => ipcRenderer.invoke('claude-account:sign-in', apiKey),
    signOut:   () => ipcRenderer.invoke('claude-account:sign-out'),
    getStatus: () => ipcRenderer.invoke('claude-account:get-status'),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  },

  // Activation stubs - free BYOK mode, always return success
  desktopIsActivated: () => Promise.resolve({ activated: true }),
  desktopGetActivationStatus: () => Promise.resolve({ ok: true, activated: true, planType: 'free-byok' }),
  desktopGetUser: () => Promise.resolve({ ok: true, user: null }),
  desktopActivate: () => Promise.resolve({ success: true }),
  desktopDeactivate: () => Promise.resolve({ ok: true }),
  desktopOpenActivation: () => ipcRenderer.invoke('settings:open-window'),
  desktopGetCredits: () => Promise.resolve({ success: true, credits: { remaining: 9999, total: 9999, used: 0, planType: 'free-byok' } }),
  desktopSyncCredits: () => Promise.resolve({ success: true, credits: { remaining: 9999, total: 9999, used: 0, planType: 'free-byok' } }),
  closeActivationWindow: () => Promise.resolve({ ok: true }),
  desktopIsAuthenticated: () => Promise.resolve({ authenticated: true }),
  desktopLogin: () => ipcRenderer.invoke('settings:open-window'),
  desktopLogout: () => Promise.resolve({ ok: true }),
  desktopOpenLogin: () => ipcRenderer.invoke('settings:open-window'),
  closeLoginWindow: () => Promise.resolve({ ok: true }),
  
  // Setup progress events (first-run dependency install)
  onSetupProgress: (callback) => {
    ipcRenderer.on('setup-progress', (_e, data) => {
      try { callback(data); } catch (err) { console.error('onSetupProgress handler error', err); }
    });
  },

  // Event listeners for main process communications
  onQuickCaptureResult: (callback) => {
    ipcRenderer.on('quick-capture-result', (event, imageData) => {
      callback(imageData);
    });
  },
  onToggleInterviewerRecording: (callback) => {
    ipcRenderer.on('toggle-interviewer-recording', () => {
      try { callback(); } catch (err) { console.error('onToggleInterviewerRecording handler error', err); }
    });
  },
  onTriggerAskAI: (callback) => {
    ipcRenderer.on('trigger-ask-ai', () => {
      try { callback(); } catch (err) { console.error('onTriggerAskAI handler error', err); }
    });
  },
  
  onStealthToggled: (callback) => {
    ipcRenderer.on('stealth-toggled', (event, isActive) => {
      callback(isActive);
    });
  },
  onInterviewSessionEnded: (callback) => {
    ipcRenderer.on('interview-session-ended', (event, data) => {
      callback(data);
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
  listDesktopSources: (types) => ipcRenderer.invoke('desktop-sources', { types }),
  
  // Application control
  quitApp: () => ipcRenderer.invoke('quit-app')
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
// Note: Do NOT freeze ipcRenderer as it needs to manage internal event counts
// The ipcRenderer is not exposed to the renderer anyway (only electronAPI is exposed)
Object.freeze(window.electronAPI);

console.log('✅ Enhanced preload script loaded successfully');
console.log('🔧 Available APIs: captureScreen, toggleStealth, sendAudioChunk, system info, event listeners');
console.log('🛡️ Security: Context isolation enabled, electronAPI frozen');
