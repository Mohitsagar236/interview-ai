// Enhanced Interview AI Assistant Renderer
// Features: Real-time WebSocket communication, screen capture with fallback, file upload, and modern UI interactions

class InterviewAssistant {
  constructor() {
    this.ws = null;
    // Audio streaming state
    this.audioWs = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.processor = null;
    this.isRecording = false;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
  // Chat state
  this.currentSpeaker = 'user1';
  this.userNames = { user1: 'User 1', user2: 'User 2' };
  this.lastTranscript = '';
  this.streamBuffer = '';
  this.streamComplete = true;
  // Math rendering state
  this.mathReady = false;
  this.mathQueue = [];
  // Math rendering performance controls
  this.mathEnabledPanels = new Set(['stream','coach']); // selective panels
  this.mathTimers = new Map(); // key -> timeout id
  this.mathDebounceMs = 200; // Increased debounce for better performance
  // UI update throttling
  this.updateThrottles = new Map();
  this.throttleDelay = 100; // ms between UI updates
  // Smart auto-scroll state
  this.autoScrollEnabled = new Map(); // element -> boolean
  this.scrollTimeouts = new Map(); // element -> timeout id

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.connectWebSocket();
    this.updateUI();
    // Populate audio devices after a short delay (labels may require permission)
    setTimeout(() => this.populateAudioDevices(), 500);
    // Load math rendering libraries
    this.injectMathLibraries();
    // Setup smart scroll for all panels
    setTimeout(() => {
      this.setupSmartScroll(document.getElementById('transcript'));
      this.setupSmartScroll(document.getElementById('stream'));
      this.setupSmartScroll(document.getElementById('coach'));
      this.setupSmartScroll(document.getElementById('ocr'));
    }, 1000);
  }

  // WebSocket Connection Management
  connectWebSocket() {
    try {
      // Try default port first, then scan a few nearby ports if needed
      const tryConnect = (port) => new Promise((resolve) => {
        let opened = false;
        const ws = new WebSocket(`ws://localhost:${port}/ui`);
        const cleanup = () => {
          ws.onopen = null; ws.onclose = null; ws.onerror = null; ws.onmessage = null;
        };
        ws.onopen = () => { opened = true; cleanup(); resolve(ws); };
        ws.onerror = () => { cleanup(); resolve(null); };
        ws.onclose = () => { if (!opened) resolve(null); };
      });

      const attempt = async () => {
        const ports = [8765, 8766, 8767, 8768, 8769];
        for (const p of ports) {
          const cand = await tryConnect(p);
          if (cand) {
            this.ws = cand;
            break;
          }
        }
        if (!this.ws) throw new Error('No ws connection');

        this.ws.onopen = () => {
          console.log('[OK] WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.updateConnectionStatus();
          this.updateUI();
          this.showNotification('Connected to AI Assistant', 'success');
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onclose = () => {
          console.log('[X] WebSocket disconnected');
          this.isConnected = false;
          this.updateConnectionStatus();
          this.updateUI();
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.showNotification('Connection error', 'error');
        };
      };

      attempt();
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.attemptReconnect();
    }
  }

  // Connect dedicated audio socket for PCM16 streaming
  connectAudioSocket() {
    return new Promise(async (resolve, reject) => {
      const tryOpen = (port) => new Promise((res) => {
        try {
          const ws = new WebSocket(`ws://localhost:${port}/audio`);
          ws.binaryType = 'arraybuffer';
          ws.onopen = () => { this.audioWs = ws; res(true); };
          ws.onerror = () => { try { ws.close(); } catch {} res(false); };
          ws.onclose = () => { /* ignore */ };
        } catch {
          res(false);
        }
      });

      try {
        let uiPort = null;
        try {
          if (this.ws && this.ws.url) {
            const url = new URL(this.ws.url);
            uiPort = url.port ? parseInt(url.port, 10) : null;
          }
        } catch {}

        if (uiPort) {
          const ok = await tryOpen(uiPort);
          if (ok) return resolve();
        }
        const ports = [8765, 8766, 8767, 8768, 8769];
        for (const p of ports) {
          const ok = await tryOpen(p);
          if (ok) return resolve();
        }
        reject(new Error('Audio socket connection failed'));
      } catch (e) {
        reject(e);
      }
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.connectWebSocket(), this.reconnectDelay * this.reconnectAttempts);
    } else {
      this.showNotification('Failed to connect after multiple attempts', 'error');
    }
  }

  // Message Handling
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'transcript':
          this.updateTranscript(message.text || message.data || '');
          break;
        case 'stream':
          this.updateStream(message);
          break;
        case 'ocr':
          this.updateOCR(message.text || message.data || '');
          break;
        case 'resume':
          this.updateResumeStatus(message.text || message.data || '');
          break;
        case 'resume_parsed':
          this.updateResumeStatus(message.success ? 'Resume processed' : (message.error || 'Resume error'));
          break;
        case 'coach':
          this.updateCoach(message, message.text || message.data || '');
          break;
        case 'error':
          this.showNotification(message.text || message.data || 'Error', 'error');
          break;
        case 'status':
          this.updateStatus(message.data);
          break;
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  // Dynamic Container Height Adjustment
  adjustContainerHeight(element) {
    if (!element) return;
    
    // Remove placeholder if content exists
    const placeholder = element.querySelector('.placeholder-text');
    if (placeholder && element.textContent.trim() && element.textContent.trim() !== placeholder.textContent.trim()) {
      placeholder.remove();
    }
    
    // Auto-adjust height based on content
    const lines = element.textContent.split('\n').length;
    const hasContent = element.textContent.trim().length > 0;
    
    if (hasContent) {
      // Dynamic height: minimum 30px, grows with content
      const minHeight = 30;
      const lineHeight = 16; // Based on font-size 11px * line-height 1.4
      const calculatedHeight = Math.max(minHeight, lines * lineHeight + 20);
      element.style.minHeight = calculatedHeight + 'px';
    } else {
      element.style.minHeight = '30px';
    }
  }

  // Smart Auto-Scroll Management
  setupSmartScroll(element) {
    if (!element || element.dataset.scrollSetup === 'true') return;
    
    element.dataset.scrollSetup = 'true';
    this.autoScrollEnabled.set(element, true);
    element.dataset.autoScroll = 'true';
    
    let userScrolling = false;
    let scrollTimeout = null;
    
    // Detect user scroll
    element.addEventListener('wheel', () => {
      // User is manually scrolling
      userScrolling = true;
      
      // Check if user scrolled near bottom (within 50px)
      const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 50;
      
      if (isNearBottom) {
        // User scrolled back to bottom, re-enable auto-scroll
        this.autoScrollEnabled.set(element, true);
        element.dataset.autoScroll = 'true';
      } else {
        // User scrolled up, disable auto-scroll
        this.autoScrollEnabled.set(element, false);
        element.dataset.autoScroll = 'false';
      }
      
      // Clear existing timeout
      if (scrollTimeout) clearTimeout(scrollTimeout);
      
      // Auto re-enable after 3 seconds of no scrolling
      scrollTimeout = setTimeout(() => {
        userScrolling = false;
        // Check if at bottom when timeout expires
        const isAtBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 10;
        if (isAtBottom) {
          this.autoScrollEnabled.set(element, true);
          element.dataset.autoScroll = 'true';
        }
      }, 3000);
    });
    
    // Also detect touch scrolling on mobile
    element.addEventListener('touchstart', () => {
      userScrolling = true;
      this.autoScrollEnabled.set(element, false);
      element.dataset.autoScroll = 'false';
    });
  }

  smartScrollToBottom(element) {
    if (!element) return;
    
    // Check if auto-scroll is enabled for this element
    const autoScroll = this.autoScrollEnabled.get(element);
    
    if (autoScroll !== false) {
      // Only scroll if enabled (true or undefined)
      element.scrollTop = element.scrollHeight;
      element.dataset.autoScroll = 'true';
    }
  }

  // UI Updates with throttling
  throttleUpdate(key, fn, delay = this.throttleDelay) {
    const existingTimer = this.updateThrottles.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      fn();
      this.updateThrottles.delete(key);
    }, delay);
    this.updateThrottles.set(key, timer);
  }

  updateTranscript(text) {
    this.throttleUpdate('transcript', () => {
      const transcriptEl = document.getElementById('transcript');
      if (!transcriptEl) return;
      this.lastTranscript = text || '';
      const name1 = (document.getElementById('user1Name')?.value || this.userNames.user1).trim() || 'User 1';
      const name2 = (document.getElementById('user2Name')?.value || this.userNames.user2).trim() || 'User 2';
      
      // Use DocumentFragment for better performance
      const fragment = document.createDocumentFragment();
      const container = document.createElement('div');
      container.className = 'chat-log';
      
      // Naive split: when a question mark occurs, switch to other user for the next utterance.
      const parts = String(text).split(/([\.!?]\s+)/);
      let speaker = this.currentSpeaker;
      let buffer = '';
      
      for (let i = 0; i < parts.length; i++) {
        buffer += parts[i] || '';
        if (i % 2 === 1) { // end of sentence delim captured
          const content = buffer.trim();
          buffer = '';
          if (!content) continue;
          const bubble = document.createElement('div');
          bubble.className = `bubble ${speaker}`;
          const name = document.createElement('span');
          name.className = 'name';
          name.textContent = speaker === 'user1' ? name1 : name2;
          bubble.appendChild(name);
          bubble.appendChild(document.createTextNode(content));
          container.appendChild(bubble);
          // Heuristic: switch speaker after a question or end of sentence
          if (/[?]$/.test(content) || /[.!]$/.test(content)) {
            speaker = speaker === 'user1' ? 'user2' : 'user1';
          }
        }
      }
      // If any remaining buffer
      const tail = buffer.trim();
      if (tail) {
        const bubble = document.createElement('div');
        bubble.className = `bubble ${speaker}`;
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = speaker === 'user1' ? name1 : name2;
        bubble.appendChild(name);
        bubble.appendChild(document.createTextNode(tail));
        container.appendChild(bubble);
      }
      
      fragment.appendChild(container);
      transcriptEl.innerHTML = '';
      transcriptEl.appendChild(fragment);
      this.smartScrollToBottom(transcriptEl);
      this.adjustContainerHeight(transcriptEl);
    });
  }

  updateStream(message = {}) {
    this.throttleUpdate('stream', () => {
      const streamEl = document.getElementById('stream');
      if (!streamEl) return;

      const chunk = typeof message.text === 'string'
        ? message.text
        : (typeof message.data === 'string' ? message.data : '');

      // Log all stream messages for debugging
      if (message.reset) {
        console.log('🔄 Stream RESET');
      }
      if (chunk) {
        console.log('📥 Stream chunk:', chunk.substring(0, 50), '... (len:', chunk.length, ')');
      }
      if (message.complete) {
        console.log('✅ Stream COMPLETE, total buffer length:', this.streamBuffer.length);
      }

      if (message.reset) {
        this.streamBuffer = '';
        this.streamComplete = false;
        // Don't clear the entire chat history, just prepare for new answer
        // Remove placeholder if it exists
        const placeholder = streamEl.querySelector('.placeholder-text');
        if (placeholder) {
          placeholder.remove();
        }
        streamEl.dataset.complete = 'false';
      }

      if (chunk) {
        if (!this.streamBuffer && streamEl.innerHTML.includes('loading')) {
          console.log('🔥 Clearing "Thinking..." placeholder');
          // Don't clear everything, just remove loading indicator
          const loadingEls = streamEl.querySelectorAll('.loading-indicator');
          loadingEls.forEach(el => el.remove());
        }
        
        this.streamBuffer += chunk;
        
        // Update or create the current answer bubble
        let currentAnswer = streamEl.querySelector('.answer-bubble.current');
        if (!currentAnswer) {
          // Create new answer bubble
          currentAnswer = document.createElement('div');
          currentAnswer.className = 'answer-bubble current';
          
          const label = document.createElement('div');
          label.className = 'answer-label';
          label.textContent = '🤖 AI Assistant';
          currentAnswer.appendChild(label);
          
          const content = document.createElement('div');
          content.className = 'answer-content';
          currentAnswer.appendChild(content);
          
          streamEl.appendChild(currentAnswer);
        }
        
        // Update the content
        const content = currentAnswer.querySelector('.answer-content');
        if (content) {
          content.textContent = this.streamBuffer;
        }
        
        this.smartScrollToBottom(streamEl);
        this.adjustContainerHeight(streamEl);
        this.scheduleMathRender('stream', streamEl);
      }

      if (message.complete) {
        this.streamComplete = true;
        streamEl.dataset.complete = 'true';
        console.log('✅ Final buffer content (first 100 chars):', this.streamBuffer.substring(0, 100));
        
        // Mark answer as complete (remove 'current' class)
        const currentAnswer = streamEl.querySelector('.answer-bubble.current');
        if (currentAnswer) {
          currentAnswer.classList.remove('current');
        }
      }

      if (message.error) {
        console.error('❌ Stream error:', message.text || message.data);
        this.showNotification(message.text || message.data || 'AI error', 'error');
      }
    }, 50); // Faster updates for streaming
  }

  updateCoach(message, text) {
    const el = document.getElementById('coach');
    if (!el) return;
    
    if (message && message.reset) {
      // Remove only the current coaching session bubbles, keep history
      const currentCoach = el.querySelector('.answer-bubble.current-coach');
      if (currentCoach) {
        currentCoach.remove();
      }
      const loadingIndicators = el.querySelectorAll('.loading-indicator');
      loadingIndicators.forEach(indicator => indicator.remove());
      
      // Store context info for when we create the answer bubble
      if (message.contextType) {
        el.dataset.pendingContextType = message.contextType;
        el.dataset.pendingContextLabel = message.contextLabel || '❓ Question';
      }
      return;
    }
    
    if (text && text.trim()) {
      // Find or create the current coach answer bubble
      let currentCoach = el.querySelector('.answer-bubble.current-coach');
      
      if (!currentCoach) {
        // Remove placeholder if it exists
        const placeholder = el.querySelector('.placeholder-text');
        if (placeholder) {
          placeholder.remove();
        }
        
        // Remove loading indicator
        const loadingIndicators = el.querySelectorAll('.loading-indicator');
        loadingIndicators.forEach(indicator => indicator.remove());
        
        // Create new coach answer bubble
        currentCoach = document.createElement('div');
        currentCoach.className = 'answer-bubble current-coach';
        
        // Get context information
        const contextLabel = el.dataset.pendingContextLabel || '🎯 Suggested Answer';
        const contextType = el.dataset.pendingContextType || 'general';
        
        // Clear pending context
        delete el.dataset.pendingContextType;
        delete el.dataset.pendingContextLabel;
        
        const label = document.createElement('div');
        label.className = 'answer-label';
        label.textContent = contextLabel;
        
        // Add context type as CSS class for styling
        currentCoach.classList.add(`context-${contextType}`);
        
        currentCoach.appendChild(label);
        
        const content = document.createElement('div');
        content.className = 'answer-content';
        currentCoach.appendChild(content);
        
        el.appendChild(currentCoach);
      }
      
      // Update the content (append for streaming)
      const content = currentCoach.querySelector('.answer-content');
      if (content) {
        content.textContent += text;
      }
      
      this.smartScrollToBottom(el);
      this.adjustContainerHeight(el);
      this.scheduleMathRender('coach', el);
    }
  }

  updateOCR(text) {
    const ocrEl = document.getElementById('ocr');
    if (text.trim()) {
      ocrEl.textContent = text;
      this.smartScrollToBottom(ocrEl);
      this.adjustContainerHeight(ocrEl);
      // this.renderMath(ocrEl); // Removed math rendering for OCR
    }
    
    // Update OCR status
    const statusEl = document.getElementById('ocrStatus');
    if (text.trim()) {
      statusEl.textContent = '✅ Text extracted successfully';
      statusEl.style.color = 'var(--success-color)';
    } else {
      statusEl.textContent = '⚠️ No text found in capture';
      statusEl.style.color = 'var(--warning-color)';
    }
  }

  updateResumeStatus(message) {
    const statusEl = document.getElementById('resumeStatus');
    statusEl.textContent = message;
    statusEl.style.color = message.includes('✅') ? 'var(--success-color)' : 'var(--warning-color)';
  }

  updateStatus(message) {
    try {
      if (!message || typeof message !== 'object') return;
      // Update audio listening status in header text
      const status = document.getElementById('connectionStatus');
      if (message.audio && status) {
        const base = this.isConnected ? 'Connected' : 'Disconnected';
        if (message.audio === 'listening') {
          status.textContent = `${base} • Listening`;
        } else if (message.audio === 'stopped') {
          status.textContent = `${base} • Stopped`;
        } else if (message.audio === 'receiving') {
          status.textContent = `${base} • Receiving audio`;
        }
      }
      if (message.asr === 'ready') {
        this.showNotification('ASR engine ready', 'info');
      }
      // Auto-coach is always on - no UI sync needed
      // Rate limit and fallback notifications
      if (message.rate_limited) {
        if (message.retry_in != null) {
          this.showNotification(`Model ${message.model || ''} rate-limited. Retrying in ${message.retry_in}s...`, 'warning');
        } else if (message.retry_exhausted) {
          this.showNotification('Model still rate-limited after retries.', 'error');
        }
      }
      if (message.using_fallback) {
        this.showNotification(`Using fallback model: ${message.model}`, 'info');
      }
    } catch (e) {
      console.log('Status update:', message);
    }
  }

  updateConnectionStatus() {
    const dot = document.getElementById('connectionDot');
    const status = document.getElementById('connectionStatus');
    
    if (this.isConnected) {
      dot.classList.add('connected');
      status.textContent = 'Connected';
    } else {
      dot.classList.remove('connected');
      status.textContent = 'Disconnected';
    }
  }

  updateUI() {
    const startBtn = document.getElementById('start');
    const stopBtn = document.getElementById('stop');
    
    startBtn.disabled = this.isRecording || !this.isConnected;
    stopBtn.disabled = !this.isRecording;
    
    // Update recording status
    if (this.isRecording) {
      startBtn.innerHTML = '🔴 Recording...';
      startBtn.classList.add('btn-warning');
      startBtn.classList.remove('btn-success');
    } else {
      startBtn.innerHTML = '🎤 Start Recording';
      startBtn.classList.add('btn-success');
      startBtn.classList.remove('btn-warning');
    }
  }

  // Event Listeners Setup
  setupEventListeners() {
    // Recording controls
    document.getElementById('start').addEventListener('click', () => this.startRecording());
    document.getElementById('stop').addEventListener('click', () => this.stopRecording());
    
    // AI interaction
    document.getElementById('ask').addEventListener('click', () => this.askAI());
    // Manual coach trigger
    const coachBtn = document.getElementById('coachNow');
    if (coachBtn) {
      coachBtn.addEventListener('click', () => {
        const coachEl = document.getElementById('coach');
        if (coachEl) {
          // Remove placeholder if it exists
          const placeholder = coachEl.querySelector('.placeholder-text');
          if (placeholder) {
            placeholder.remove();
          }
          
          // Add loading indicator
          const loadingDiv = document.createElement('div');
          loadingDiv.className = 'loading-indicator';
          loadingDiv.innerHTML = '<div class="loading">Generating<span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';
          coachEl.appendChild(loadingDiv);
          this.smartScrollToBottom(coachEl);
        }
  this.sendMessage({ type: 'coach', question_channel: 'transcription' });
      });
    }

    // Toolbar toggle
    const toggleToolbarBtn = document.getElementById('toggleToolbar');
    if (toggleToolbarBtn && window.electronAPI && window.electronAPI.toggleToolbar) {
      toggleToolbarBtn.addEventListener('click', () => {
        window.electronAPI.toggleToolbar();
      });
    }

    // Mic quick toggle
    const micToggle = document.getElementById('micToggle');
    if (micToggle) {
      micToggle.addEventListener('click', () => {
        if (this.isRecording) { this.stopRecording(); } else { this.startRecording(); }
      });
    }

    // Speaker toggle
    const speakerUser1 = document.getElementById('speakerUser1');
    const speakerUser2 = document.getElementById('speakerUser2');
    const toggleActive = (active) => {
      if (speakerUser1 && speakerUser2) {
        speakerUser1.classList.toggle('active', active === 'user1');
        speakerUser2.classList.toggle('active', active === 'user2');
      }
    };
    if (speakerUser1) speakerUser1.addEventListener('click', () => { this.currentSpeaker = 'user1'; toggleActive('user1'); });
    if (speakerUser2) speakerUser2.addEventListener('click', () => { this.currentSpeaker = 'user2'; toggleActive('user2'); });
    toggleActive(this.currentSpeaker);

    // Sync speaker button labels with name inputs and re-render transcript
    const user1Input = document.getElementById('user1Name');
    const user2Input = document.getElementById('user2Name');
    const syncLabels = () => {
      if (speakerUser1) speakerUser1.textContent = (user1Input?.value || 'User 1').trim() || 'User 1';
      if (speakerUser2) speakerUser2.textContent = (user2Input?.value || 'User 2').trim() || 'User 2';
    };
    if (user1Input) user1Input.addEventListener('input', () => { this.userNames.user1 = user1Input.value.trim() || 'User 1'; syncLabels(); this.updateTranscript(this.lastTranscript); });
    if (user2Input) user2Input.addEventListener('input', () => { this.userNames.user2 = user2Input.value.trim() || 'User 2'; syncLabels(); this.updateTranscript(this.lastTranscript); });
    syncLabels();
   }

  setupDragAndDrop() {
    const dropZone = document.querySelector('.file-upload-label');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, this.preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, this.highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, this.unhighlight, false);
    });
    
    dropZone.addEventListener('drop', (e) => this.handleDrop(e), false);
  }

  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  highlight(e) {
    e.currentTarget.style.borderColor = 'var(--primary-color)';
    e.currentTarget.style.backgroundColor = 'var(--surface-dark)';
  }

  unhighlight(e) {
    e.currentTarget.style.borderColor = 'var(--border)';
    e.currentTarget.style.backgroundColor = 'var(--surface)';
  }

  handleDrop(e) {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      this.processFile(files[0]);
    }
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + R: Start/Stop Recording
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        if (this.isRecording) {
          this.stopRecording();
        } else {
          this.startRecording();
        }
      }
      
      // Ctrl/Cmd + K: Ask AI
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.askAI();
      }
      
      // Ctrl/Cmd + Shift + C: Capture Screen
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        this.captureScreen();
      }
    });
  }

  // Core Actions
  startRecording() {
    if (!this.isConnected) {
      this.showNotification('Not connected to server', 'error');
      return;
    }
    
    const start = async () => {
      try {
  // Open audio socket first so server receives start_audio status promptly
  await this.connectAudioSocket();
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        // Request 16kHz to match server; some browsers may choose nearest supported rate
        this.audioContext = new AudioContext({ sampleRate: 16000 });
        // Ensure context is running (Chrome may start suspended until user gesture)
        if (this.audioContext.state === 'suspended') {
          try { await this.audioContext.resume(); } catch {}
        }
          // Determine desired audio source
          const sourceSel = document.getElementById('audioSource');
          const deviceSel = document.getElementById('audioDevice');
          const sourceVal = sourceSel ? sourceSel.value : 'microphone';
          const deviceId = deviceSel ? deviceSel.value : '';

          if (sourceVal === 'system') {
            console.log('Requesting system audio (display capture)...');
            try {
              // Prefer standard getDisplayMedia; include video to satisfy some Chromium requirements
              const ds = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
              // Remove video tracks; we only need audio
              ds.getVideoTracks().forEach(t => t.stop());
              this.mediaStream = ds;
              console.log('System audio granted');
            } catch (e) {
              console.warn('getDisplayMedia failed, trying desktop getUserMedia fallback:', e);
              // Electron/Chromium desktop audio fallback
              this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  mandatory: { chromeMediaSource: 'desktop' }
                }
              });
            }
          } else {
            console.log('Requesting microphone...');
            const constraints = {
              audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                ...(deviceId ? { deviceId: { exact: deviceId } } : {})
              }
            };
            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('Microphone granted');
          }
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        const inRate = this.audioContext.sampleRate || 48000;

        const toPCM16 = (float32Array) => {
          const buf = new ArrayBuffer(float32Array.length * 2);
          const view = new DataView(buf);
          for (let i = 0; i < float32Array.length; i++) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
          }
          return buf;
        };

        const downsampleLinear = (input, srcRate, dstRate) => {
          if (dstRate === srcRate) return input;
          const ratio = srcRate / dstRate;
          const newLen = Math.max(1, Math.floor(input.length / ratio));
          const output = new Float32Array(newLen);
          for (let i = 0; i < newLen; i++) {
            const idx = i * ratio;
            const i0 = Math.floor(idx);
            const i1 = Math.min(input.length - 1, i0 + 1);
            const w = idx - i0;
            output[i] = (1 - w) * input[i0] + w * input[i1];
          }
          return output;
        };

        processor.onaudioprocess = (e) => {
          if (!this.isRecording || !this.audioWs || this.audioWs.readyState !== WebSocket.OPEN) return;
          // Grab mono channel data
          const input = e.inputBuffer.getChannelData(0);
          // Downsample to 16k if needed
          const ds = downsampleLinear(input, inRate, 16000);
          const buf = toPCM16(ds);
          try { this.audioWs.send(buf); } catch (err) { console.error('Audio send error:', err); }
        };
        source.connect(processor);
        processor.connect(this.audioContext.destination);
        this.processor = processor;

  this.sendMessage({ type: 'start_audio' });
        this.isRecording = true;
        this.updateUI();
        this.showNotification('Recording started', 'success');
      } catch (e) {
        console.error('Failed to start recording:', e);
        this.showNotification('Microphone or audio init failed', 'error');
  this.isRecording = false;
  this.updateUI();
      }
    };
    start();
  }

  stopRecording() {
  this.sendMessage({ type: 'stop_audio' });
    this.isRecording = false;
    try {
      if (this.processor) {
        this.processor.disconnect();
        this.processor.onaudioprocess = null;
        this.processor = null;
      }
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(t => t.stop());
        this.mediaStream = null;
      }
      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
      }
      if (this.audioWs) {
        try { this.audioWs.close(); } catch {}
        this.audioWs = null;
      }
    } catch {}
    this.updateUI();
    this.showNotification('Recording stopped', 'warning');
  }

  askAI() {
    if (!this.isConnected) {
      this.showNotification('Not connected to server', 'error');
      return;
    }
    const facts = document.getElementById('facts').value;
    
    // Display the question in the stream panel
    const streamEl = document.getElementById('stream');
    
    // Remove placeholder if it exists
    const placeholder = streamEl.querySelector('.placeholder-text');
    if (placeholder) {
      placeholder.remove();
    }
    
    // Create question bubble
    if (facts && facts.trim()) {
      const questionBubble = document.createElement('div');
      questionBubble.className = 'question-bubble';
      
      const label = document.createElement('div');
      label.className = 'question-label';
      label.textContent = '❓ Your Question';
      questionBubble.appendChild(label);
      
      const content = document.createElement('div');
      content.className = 'question-content';
      content.textContent = facts.trim();
      questionBubble.appendChild(content);
      
      streamEl.appendChild(questionBubble);
    }
    
    // Detect question context to help AI focus on the right data
    const questionLower = facts.toLowerCase();
    let contextType = 'general';
    
    // Check if question is about transcription/conversation/speech
    if (questionLower.match(/transcri(pt|ption|be)|conversation|speech|said|audio|record|mic|listen|talk|spoke/)) {
      contextType = 'transcription';
    }
    // Check if question is about screen capture/OCR/visual content
    else if (questionLower.match(/screen|capture|image|ocr|see|visual|display|show|code|error|picture/)) {
      contextType = 'capture';
    }
    
    // Send message to AI with context type
    this.sendMessage({
      type: 'ask',
      facts: facts,
      contextType: contextType  // New field to help server focus on relevant data
    });
    
    // Prepare for answer
    this.streamBuffer = '';
    this.streamComplete = false;
    
    // Create loading indicator for the answer
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-indicator';
    loadingDiv.innerHTML = '<div class="loading">Thinking<span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';
    streamEl.appendChild(loadingDiv);
    
    this.smartScrollToBottom(streamEl);
    streamEl.dataset.complete = 'false';
    this.adjustContainerHeight(streamEl);
    this.showNotification('AI is thinking...', 'info');
  }

  captureScreen() {
    if (!this.isConnected) {
      this.showNotification('Not connected to server', 'error');
      return;
    }
    
    // Show loading state
    const captureBtn = document.getElementById('capture');
    const originalText = captureBtn.innerHTML;
    captureBtn.innerHTML = '📸 Capturing...';
    captureBtn.disabled = true;
    
  // Update OCR status
  const statusEl = document.getElementById('ocrStatus');
  statusEl.textContent = '📸 Capturing screen...';
    statusEl.style.color = 'var(--primary-color)';
    
    // Request screen capture via Electron main process
    window.electronAPI.captureScreen()
      .then((base64Image) => {
        if (base64Image) {
          this.sendMessage({
            type: 'ocr',
            image: base64Image
          });
          statusEl.textContent = '🔍 Analyzing image...';
        } else {
          statusEl.textContent = '❌ Failed to capture screen';
          statusEl.style.color = 'var(--error-color)';
        }
      })
      .catch((error) => {
        console.error('Screen capture failed:', error);
        statusEl.textContent = '❌ Screen capture failed';
        statusEl.style.color = 'var(--error-color)';
        this.showNotification('Screen capture failed', 'error');
      })
      .finally(() => {
        captureBtn.innerHTML = originalText;
        captureBtn.disabled = false;
      });
  }

  handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
      this.processFile(file);
    }
  }

  processFile(file) {
    if (!this.isConnected) {
      this.showNotification('Not connected to server', 'error');
      return;
    }
    
    // Check file type
    const allowedTypes = ['.pdf', '.txt', '.md', '.docx'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
      this.showNotification('Please upload a PDF, TXT, MD, or DOCX file', 'error');
      return;
    }
    
    // Update status
    const statusEl = document.getElementById('resumeStatus');
    statusEl.textContent = '📤 Uploading and processing...';
    statusEl.style.color = 'var(--primary-color)';
    
    // Read file as base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64Content = reader.result.split(',')[1];
      
      this.sendMessage({
        type: 'resume',
        filename: file.name,
        content: base64Content
      });
      
      this.showNotification(`Uploaded ${file.name}`, 'success');
    };
    
    reader.onerror = () => {
      statusEl.textContent = '❌ Failed to read file';
      statusEl.style.color = 'var(--error-color)';
      this.showNotification('Failed to read file', 'error');
    };
    
    reader.readAsDataURL(file);
  }

  toggleStealthMode() {
    if (window.electronAPI && window.electronAPI.toggleStealth) {
      window.electronAPI.toggleStealth()
        .then((active) => {
          this.showNotification(`Stealth mode ${active ? 'enabled' : 'disabled'}`, active ? 'success' : 'warning');
        })
        .catch((e) => {
          console.error('Toggle stealth failed:', e);
          this.showNotification('Failed to toggle stealth mode', 'error');
        });
    } else {
      this.showNotification('Stealth toggle not available', 'warning');
    }
  }

  async populateAudioDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      const sel = document.getElementById('audioDevice');
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = '';
      const optAuto = document.createElement('option');
      optAuto.value = '';
      optAuto.textContent = 'Auto (default input)';
      sel.appendChild(optAuto);
      inputs.forEach(d => {
        const o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || `Device ${d.deviceId.slice(0,6)}`;
        sel.appendChild(o);
      });
      if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
    } catch (e) {
      console.warn('enumerateDevices failed:', e);
    }
  }

  // Dynamically inject KaTeX resources (CSS + JS + auto-render)
  injectMathLibraries() {
    if (document.getElementById('katex-style')) return; // Already injected
    const head = document.head || document.getElementsByTagName('head')[0];
    const css = document.createElement('link');
    css.id = 'katex-style';
    css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
    head.appendChild(css);

    const core = document.createElement('script');
    core.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js';
    core.defer = true;
    core.onload = () => {
      const auto = document.createElement('script');
      auto.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js';
      auto.defer = true;
      auto.onload = () => {
        this.mathReady = true;
        this.mathQueue.forEach(el => this.renderMath(el));
        this.mathQueue = [];
      };
      head.appendChild(auto);
    };
    head.appendChild(core);
  }

  // Render math expressions inside element; queue if libs not ready
  renderMath(el) {
    if (!el) return;
    if (!this.mathReady || typeof window.renderMathInElement !== 'function') {
      if (!this.mathQueue.includes(el)) this.mathQueue.push(el);
      return;
    }
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false,
        strict: 'ignore'
      });
    } catch (e) {
      console.warn('Math render error:', e);
    }
  }

  // Debounced scheduling keyed by panel id
  scheduleMathRender(key, el) {
    if (!this.mathEnabledPanels.has(key)) return; // skip panels not enabled
    if (!el) return;
    if (this.mathTimers.has(key)) {
      clearTimeout(this.mathTimers.get(key));
    }
    this.mathTimers.set(key, setTimeout(() => {
      this.renderMath(el);
      this.mathTimers.delete(key);
    }, this.mathDebounceMs));
  }

  // Utility Methods
  sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
      this.showNotification('Not connected to server', 'error');
    }
  }

  showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Create a simple notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      max-width: 300px;
      box-shadow: var(--shadow-lg);
      transition: all 0.3s ease;
      transform: translateX(100%);
    `;
    
    // Set background color based on type
    switch (type) {
      case 'success':
        notification.style.background = 'var(--success-color)';
        break;
      case 'error':
        notification.style.background = 'var(--error-color)';
        break;
      case 'warning':
        notification.style.background = 'var(--warning-color)';
        break;
      default:
        notification.style.background = 'var(--primary-color)';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Interview AI Assistant starting up...');
  
  // Initialize the main application
  const app = new InterviewAssistant();
  
  // Make app globally available for debugging
  window.interviewApp = app;
  
  console.log('✅ Interview AI Assistant ready!');
  console.log('💡 Keyboard shortcuts:');
  console.log('   Ctrl/Cmd + R: Start/Stop Recording');
  console.log('   Ctrl/Cmd + K: Ask AI');
  console.log('   Ctrl/Cmd + Shift + C: Capture Screen');
});

// Handle page visibility changes (for better UX when switching tabs)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    console.log('Tab became visible - checking connection');
    // Could add reconnection logic here if needed
  }
});

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { InterviewAssistant };
}
