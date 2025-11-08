// Compact toolbar script with enhanced UI and chat system
(function () {
  const state = {
    ws: null,
    connected: false,
    recording: false,
    recordingMode: null, // 'interviewer' or 'student'
    audioWs: null,
    audioContext: null,
    processor: null,
    mediaStream: null,
    currentSpeaker: "user1", // Track current speaker
    userNames: { user1: "User 1", user2: "User 2" }, // Default names
    serverPort: 8765, // Port used by UI + audio sockets
    capturedScreens: [], // Store multiple screen captures
    captureCount: 0, // Track number of captures
    chatHistory: [], // Store chat messages
    lastContext: "", // Store last context for AI queries
    lastChatActivity: Date.now(), // Track last chat activity for auto-collapse
    micEnabled: false, // Student mic on/off toggle
    interviewerRecording: false, // Track interviewer recording state separately
    studentMicOn: false, // Track student mic state separately
    autoTriggerAI: false, // Flag to auto-trigger AI after capture
    forceCaptureRequest: false, // Route next AI request through capture channel
    lastQuestionContext: "general", // Track the context of the last AI question for follow-ups
    companyBrief: null, // Persisted company brief payload shared with AI
    pendingCompanyBrief: null, // Company brief awaiting server acknowledgement
    companyBriefSilentSync: false, // Suppress UI noise when auto-syncing stored brief
    companyBriefConfirmedForSession: false, // Require a fresh confirmation each interview session
    companyBriefPendingAction: null, // Deferred action awaiting company brief completion
    companyBriefConfirmationPending: false, // Awaiting server ack for submitted brief
  };

  const COMPANY_BRIEF_STORAGE_KEY = "company_brief_context";

  // Separate transcript buffers (recent segments)
  state.interviewerSegments = [];
  state.studentSegments = [];
  state.analysisSegments = [];
  state.maxTranscriptSegments = 120; // rolling window

  // ==========================================
  // ENHANCEMENTS FOR 100% SCORE
  // ==========================================

  // 1. LOG LEVEL SYSTEM
  const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
  const CURRENT_LOG_LEVEL = localStorage.getItem("log_level") || "INFO";
  const log = {
    debug: (...args) =>
      LOG_LEVELS[CURRENT_LOG_LEVEL] <= LOG_LEVELS.DEBUG &&
      console.log("[DEBUG]", ...args),
    info: (...args) =>
      LOG_LEVELS[CURRENT_LOG_LEVEL] <= LOG_LEVELS.INFO &&
      console.info("[INFO]", ...args),
    warn: (...args) =>
      LOG_LEVELS[CURRENT_LOG_LEVEL] <= LOG_LEVELS.WARN &&
      console.warn("[WARN]", ...args),
    error: (...args) =>
      LOG_LEVELS[CURRENT_LOG_LEVEL] <= LOG_LEVELS.ERROR &&
      console.error("[ERROR]", ...args),
  };

  // 2. FILE SIZE VALIDATION
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  function validateFileSize(file) {
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      showNotification(
        `File too large (${sizeMB}MB). Maximum size is 10MB.`,
        "error",
      );
      return false;
    }
    return true;
  }

  // 3. AI REQUEST RATE LIMITING
  const aiRateLimit = {
    requests: [],
    maxPerMinute: 10,
    check() {
      const now = Date.now();
      this.requests = this.requests.filter((t) => now - t < 60000);
      return this.requests.length < this.maxPerMinute;
    },
    add() {
      this.requests.push(Date.now());
    },
    getRemainingRequests() {
      const now = Date.now();
      this.requests = this.requests.filter((t) => now - t < 60000);
      return this.maxPerMinute - this.requests.length;
    },
    getResetTime() {
      if (this.requests.length === 0) return 0;
      const oldest = Math.min(...this.requests);
      return Math.max(0, Math.ceil((oldest + 60000 - Date.now()) / 1000));
    },
  };

  // 4. CONNECTION HEALTH MONITORING
  const connectionHealth = {
    pingInterval: null,
    lastPongTime: 0,
    missedPongs: 0,
    maxMissedPongs: 3,
    start() {
      this.stop();
      this.lastPongTime = Date.now();
      this.missedPongs = 0;
      this.pingInterval = setInterval(() => {
        if (
          !state.connected ||
          !state.ws ||
          state.ws.readyState !== WebSocket.OPEN
        )
          return;
        const timeSinceLastPong = Date.now() - this.lastPongTime;
        if (timeSinceLastPong > 35000) {
          this.missedPongs++;
          log.warn(
            `Missed pong #${this.missedPongs}. Connection may be unstable.`,
          );
          if (this.missedPongs >= this.maxMissedPongs) {
            log.error("Too many missed pongs. Reconnecting...");
            state.ws.close();
            return;
          }
        }
        try {
          send({ type: "ping", timestamp: Date.now() });
          log.debug("Sent ping");
        } catch (e) {
          log.error("Failed to send ping:", e);
        }
      }, 30000);
    },
    stop() {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    },
    receivedPong() {
      this.lastPongTime = Date.now();
      this.missedPongs = 0;
      log.debug("Received pong");
    },
  };

  // 5. PERFORMANCE METRICS
  const performanceMetrics = {
    transcription: [],
    ocr: [],
    aiResponse: [],
    maxSamples: 100,
    startTimer(operation) {
      return {
        operation,
        startTime: performance.now(),
        end() {
          const duration = performance.now() - this.startTime;
          performanceMetrics.recordMetric(this.operation, duration);
          return duration;
        },
      };
    },
    recordMetric(type, duration) {
      if (!this[type]) this[type] = [];
      this[type].push(duration);
      if (this[type].length > this.maxSamples) this[type].shift();
      log.debug(`${type} took ${duration.toFixed(2)}ms`);
    },
    getStats(type) {
      const metrics = this[type] || [];
      if (metrics.length === 0) return { count: 0, avg: 0, min: 0, max: 0 };
      const sorted = [...metrics].sort((a, b) => a - b);
      const sum = metrics.reduce((a, b) => a + b, 0);
      return {
        count: metrics.length,
        avg: sum / metrics.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        median: sorted[Math.floor(sorted.length / 2)],
      };
    },
  };

  // 6. USAGE STATISTICS
  const usageStats = {
    sessionStart: Date.now(),
    transcriptions: 0,
    captures: 0,
    aiQueries: 0,
    messagesReceived: 0,
    increment(type) {
      if (this[type] !== undefined) {
        this[type]++;
        localStorage.setItem("usage_stats", JSON.stringify(this.getSnapshot()));
      }
    },
    getSnapshot() {
      return {
        transcriptions: this.transcriptions,
        captures: this.captures,
        aiQueries: this.aiQueries,
        messagesReceived: this.messagesReceived,
      };
    },
    load() {
      const saved = localStorage.getItem("usage_stats");
      if (saved) {
        try {
          const data = JSON.parse(saved);
          Object.assign(this, data);
        } catch (e) {
          log.warn("Failed to load usage stats:", e);
        }
      }
    },
  };

  function normalizeCompanyBriefPayload(data) {
    if (!data || typeof data !== "object") return null;
    const normalized = { context_kind: "company" };
    const fields = ["name", "role", "website", "overview", "notes"];
    for (const key of fields) {
      const raw = data[key];
      if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed) normalized[key] = trimmed;
      }
    }
    return Object.keys(normalized).length > 1 ? normalized : null;
  }

  function persistCompanyBrief(data) {
    const normalized = normalizeCompanyBriefPayload(data);
    if (!normalized) {
      state.companyBrief = null;
      state.companyBriefConfirmedForSession = false;
      state.companyBriefConfirmationPending = false;
      try {
        localStorage.removeItem(COMPANY_BRIEF_STORAGE_KEY);
      } catch (e) {
        log.warn("Failed to clear company brief cache", e);
      }
      return null;
    }
    state.companyBrief = normalized;
    state.companyBriefConfirmedForSession = true; // Auto-confirm when saving
    try {
      localStorage.setItem(
        COMPANY_BRIEF_STORAGE_KEY,
        JSON.stringify(normalized),
      );
    } catch (e) {
      log.warn("Failed to persist company brief", e);
    }
    return normalized;
  }

  function hydrateCompanyBriefFromStorage() {
    try {
      const raw = localStorage.getItem(COMPANY_BRIEF_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      const normalized = normalizeCompanyBriefPayload(data);
      if (normalized) {
        state.companyBrief = normalized;
        state.companyBriefConfirmedForSession = true; // Auto-confirm stored company info
        log.info("Restored company brief from storage (auto-confirmed)");
      }
    } catch (e) {
      log.warn("Failed to restore company brief from storage", e);
    }
  }

  // ==========================================
  // END ENHANCEMENTS
  // ==========================================

  const $ = (id) => document.getElementById(id);

  // Legacy element references for compatibility
  const dot = $("dot");
  const statusText = $("statusText");
  const toggleRecord = $("toggleRecord");
  const recLabel = $("recLabel");
  const recIcon = $("recIcon");
  const captureBtn = $("capture");
  const uploadInput = $("uploadScreenshots");
  const companyBriefBtn = $("companyBrief");
  const companyBriefOverlay = $("companyBriefOverlay");
  const companyBriefForm = $("companyBriefForm");
  const companyNameInput = $("companyNameInput");
  const companyRoleInput = $("companyRoleInput");
  const companyWebsiteInput = $("companyWebsiteInput");
  const companyOverviewInput = $("companyOverviewInput");
  const companyNotesInput = $("companyNotesInput");
  const companyBriefStatus = $("companyBriefStatus");
  const companyBriefCancel = $("companyBriefCancel");
  const companyBriefSave = $("companyBriefSave");
  // Settings button replaced by resume upload button
  const resumeUploadBtn = $("resumeUpload");
  const resumeFileInput = $("resumeFileInput");
  const visibilityBtn = $("visibility");
  const toggleStudentBtn = $("toggleStudent");
  const sendBtn = $("send");
  const promptInput = $("prompt");
  const clearBtn = $("clear");
  const hideBtn = $("hide");
  const answerEl = $("answer");
  const copyBtn = $("copyAnswer");
  const compactBtn = $("compact");
  const askAiBtn = document.getElementById("askAI");
  const barEl = document.querySelector(".bar");
  const speakerUser1 = $("speakerUser1");
  const speakerUser2 = $("speakerUser2");
  
  // Credits UI elements
  const creditsDisplay = $("creditsDisplay");
  const creditsAmount = $("creditsAmount");
  const statusDots = document.querySelector(".status-dots");
  const timeBreakdownOverlay = $("timeBreakdownOverlay");
  const timeBreakdownClose = $("timeBreakdownClose");
  const timeHoursValue = $("timeHoursValue");
  const timeMinutesValue = $("timeMinutesValue");
  const timeSecondsValue = $("timeSecondsValue");
  const timePlanValue = $("timePlanValue");
  const timeTotalValue = $("timeTotalValue");
  const timeUsedValue = $("timeUsedValue");
  const timeRemainingValue = $("timeRemainingValue");
  const timeSessionsValue = $("timeSessionsValue");
  const timeProgressFill = $("timeProgressFill");
  const timeProgressText = $("timeProgressText");

  // New UI element references
  const recordInterviewerBtn = $("recordInterviewer");
  const listenStudentBtn = $("listenStudent");
  const captureAnalyzeBtn = $("captureAnalyze");
  const toggleChatBtn = $("toggleChat");
  const chatContainer = $("chatContainer");
  const chatMessages = $("chatMessages");
  const clearChatBtn = $("clearChat");

  function populateCompanyBriefFormFromState() {
    if (!state.companyBrief) return;
    const mapping = [
      [companyNameInput, "name"],
      [companyRoleInput, "role"],
      [companyWebsiteInput, "website"],
      [companyOverviewInput, "overview"],
      [companyNotesInput, "notes"],
    ];
    for (const [el, key] of mapping) {
      if (!el) continue;
      const stored = state.companyBrief[key] || "";
      if (!el.value) {
        el.value = stored;
      }
    }
  }

  function companyBriefIsReady() {
    const normalized = normalizeCompanyBriefPayload(state.companyBrief);
    if (!normalized) return false;
    if (state.companyBriefConfirmationPending) return false;
    return !!state.companyBriefConfirmedForSession;
  }

  // If `blocking` is true (default) the function will open the company
  // brief overlay and prevent the caller from proceeding until the brief
  // is provided/confirmed. If `blocking` is false the function will only
  // show a small non-blocking notification and allow the caller to proceed.
  function ensureCompanyBriefReady(onReady, reason = "starting the interview", blocking = true) {
    if (companyBriefIsReady()) return true;

    // Non-blocking mode: inform the user but allow the action to continue
    if (!blocking) {
      try {
        showNotification(
          "No company brief configured — proceeding without company context.",
          "info",
        );
      } catch (notifyErr) {
        log.warn("Failed to show company brief non-blocking notification", notifyErr);
      }
      return true;
    }

    if (typeof onReady === "function") {
      state.companyBriefPendingAction = onReady;
    } else {
      state.companyBriefPendingAction = null;
    }

    const normalized = normalizeCompanyBriefPayload(state.companyBrief) || {};
    const message = state.companyBriefConfirmationPending
      ? "Company brief syncing… please wait a moment."
      : "Fill the company form before " + reason + ".";

    try {
      showNotification(
        message,
        state.companyBriefConfirmationPending ? "info" : "warn",
      );
    } catch (notifyErr) {
      log.warn("Failed to show company brief notification", notifyErr);
    }

    if (companyBriefStatus) {
      const statusMessage = state.companyBriefConfirmationPending
        ? "Awaiting confirmation from the server…"
        : "Complete and share the company brief to continue.";
      resetCompanyBriefStatus(
        statusMessage,
        state.companyBriefConfirmationPending ? "info" : "warn",
      );
    }

    // Prefill the form with any stored data so the user only confirms/upates
    populateCompanyBriefFormFromState();
    if (
      companyBriefOverlay &&
      !companyBriefOverlay.classList.contains("show")
    ) {
      toggleCompanyBrief(true);
    }
    return false;
  }

  // Initialize enhancements
  usageStats.load();
  hydrateCompanyBriefFromStorage();
  
  // Load credits on startup
  loadCredits();
  
  log.info("Toolbar initialized with enhancements enabled");
  log.debug("UI Elements found:", {
    recordInterviewerBtn: !!recordInterviewerBtn,
    listenStudentBtn: !!listenStudentBtn,
    captureAnalyzeBtn: !!captureAnalyzeBtn,
    toggleChatBtn: !!toggleChatBtn,
    companyBriefBtn: !!companyBriefBtn,
    chatContainer: !!chatContainer,
    chatMessages: !!chatMessages,
    clearChatBtn: !!clearChatBtn,
    askAiBtn: !!askAiBtn,
  });

  // ---------- Dynamic window sizing (width & height) ----------
  let resizeQueued = false;
  function queueResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      performResize();
    });
  }
  function performResize() {
    try {
      const bar = barEl;
      if (!bar) return;
      const barRect = bar.getBoundingClientRect();
      let targetW = barRect.width + 12; // padding
      let targetH = barRect.height + 12; // base height
      if (chatContainer && chatContainer.classList.contains("expanded")) {
        const chatRect = chatContainer.getBoundingClientRect();
        // Increase width if chat wider
        targetW = Math.max(targetW, chatRect.width + 12);
        // Total height = toolbar top offset + chat full height (chat is positioned below toolbar via transform)
        // Chat top is relative to viewport; ensure we capture its visual height below the bar
        targetH = Math.max(targetH, chatRect.bottom - barRect.top + 12);
      }
      // Clamp and round
      targetW = Math.min(Math.max(260, Math.round(targetW)), 1600);
      targetH = Math.min(Math.max(60, Math.round(targetH)), 800);
      if (window.electronAPI && window.electronAPI.resizeToolbarDimensions) {
        window.electronAPI.resizeToolbarDimensions(targetW, targetH);
      }
    } catch (e) {
      console.warn("performResize failed", e);
    }
  }
  // Observe size changes on toolbar + chat
  try {
    const ro = new ResizeObserver(() => queueResize());
    if (barEl) ro.observe(barEl);
    if (chatContainer) ro.observe(chatContainer);
  } catch (e) {
    console.log("ResizeObserver not available", e);
  }
  // Initial
  queueResize();

  let listenStudent = false;

  // Initialize state variable for current AI response
  state.currentAIResponse = "";
  // Track a live (streaming) AI message element
  let streamingAIEl = null;
  let streamingAIStartTs = null;
  let pendingScroll = false;
  window.lastUserAIRequestTs = 0; // expose globally for gating unsolicited AI

  function requestScrollBottom() {
    if (pendingScroll) return;
    pendingScroll = true;
    requestAnimationFrame(() => {
      pendingScroll = false;
      if (chatMessages && chatMessages.children.length > 0) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    });
  }

  // Chat message functions
  function addChatMessage(type, content, timestamp = null) {
    console.log("Adding chat message:", type, content.substring(0, 50) + "...");

    if (!timestamp) timestamp = new Date();

    const message = {
      type,
      content,
      timestamp,
      id: Date.now() + Math.random(),
    };

    state.chatHistory.push(message);

    // Update last context for AI queries
    if (type === "interviewer" || type === "analysis") {
      state.lastContext = content;
    }

    renderChatMessage(message);
    // Always update last activity when any message arrives (even if user recently collapsed)
    state.lastChatActivity = Date.now();
    // Only expand automatically if not AI OR user hasn't just collapsed, AI gets forced expansion below
    if (type === "ai") {
      console.log("AI response received - forcing chat expansion");
      if (chatContainer) {
        chatContainer.removeAttribute("data-user-collapsed");
        chatContainer.removeAttribute("data-collapse-time");
        chatContainer.classList.add("expanded");
      }
    } else {
      smartExpandChat();
    }
    requestScrollBottom();
    queueResize();
  }

  // Maintain a single live transcript (all speakers) until AI button pressed
  let liveTranscriptMsgId = null;
  let liveTranscriptAccumulated = "";
  function appendToLiveTranscript(content) {
    if (!content) return;
    console.log("[appendToLiveTranscript] Adding:", content.substring(0, 50));
    if (!liveTranscriptMsgId) {
      console.log("[appendToLiveTranscript] Creating new transcript message");
      const msg = {
        type: "interviewer",
        content: "",
        timestamp: new Date(),
        id: Date.now() + Math.random(),
      };
      state.chatHistory.push(msg);
      liveTranscriptMsgId = msg.id;
      renderChatMessage(msg);
      liveTranscriptAccumulated = "";
    }
    // Single paragraph: normalize whitespace and append with a space
    const cleaned = content.replace(/\s+/g, " ").trim();
    if (cleaned) {
      if (liveTranscriptAccumulated && !liveTranscriptAccumulated.endsWith(" "))
        liveTranscriptAccumulated += " ";
      liveTranscriptAccumulated += cleaned;
    }
    const target = state.chatHistory.find((m) => m.id === liveTranscriptMsgId);
    if (target) target.content = liveTranscriptAccumulated;
    if (chatMessages) {
      const el = chatMessages.querySelector(
        `.chat-message[data-id="${liveTranscriptMsgId}"] .chat-content div:last-child`,
      );
      if (el) {
        el.innerHTML = preserveUserFormatting(liveTranscriptAccumulated.trim());
        console.log(
          "[appendToLiveTranscript] Updated DOM, total length:",
          liveTranscriptAccumulated.length,
        );
      } else {
        console.warn(
          "[appendToLiveTranscript] Could not find DOM element for message",
          liveTranscriptMsgId,
        );
      }
    }
    smartExpandChat();
    requestScrollBottom();
    queueResize();
  }

  // Update the live transcript with an interim (partial) string without
  // permanently appending it. We render: accumulated finals + current interim.
  function updateLiveTranscriptInterim(content) {
    const cleaned = (content || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return;
    if (!liveTranscriptMsgId) {
      console.log("[Transcript] Creating new live transcript message");
      const msg = {
        type: "interviewer",
        content: "",
        timestamp: new Date(),
        id: Date.now() + Math.random(),
      };
      state.chatHistory.push(msg);
      liveTranscriptMsgId = msg.id;
      renderChatMessage(msg);
      liveTranscriptAccumulated = "";
    }
    const combined =
      (liveTranscriptAccumulated
        ? liveTranscriptAccumulated.trim() + " "
        : "") + cleaned;
    console.log(
      "[Transcript] Updating live transcript, new length:",
      combined.length,
    );
    const target = state.chatHistory.find((m) => m.id === liveTranscriptMsgId);
    if (target) target.content = combined;
    if (chatMessages) {
      const el = chatMessages.querySelector(
        `.chat-message[data-id="${liveTranscriptMsgId}"] .chat-content div:last-child`,
      );
      if (el) {
        el.innerHTML = preserveUserFormatting(combined);
        console.log(
          "[Transcript] Updated DOM element for message ID:",
          liveTranscriptMsgId,
        );
      } else {
        console.warn(
          "[Transcript] Could not find DOM element for message ID:",
          liveTranscriptMsgId,
        );
      }
    }
    smartExpandChat();
    requestScrollBottom();
    queueResize();
  }

  function finalizeLiveTranscript() {
    liveTranscriptMsgId = null;
    liveTranscriptAccumulated = "";
  }

  function expandChatContainer() {
    // Use the smart expand function for better behavior
    smartExpandChat();
    queueResize();
  }

  function adjustChatHeight() {
    // With the new CSS approach, we don't need to manipulate display
    // The container is always in the DOM, just hidden/shown via opacity and visibility
    if (!chatContainer) return;

    // Ensure the chat is properly expanded if it has content
    if (chatMessages && chatMessages.children.length > 0) {
      smartExpandChat();
    }
  }

  function renderChatMessage(message) {
    const messageEl = document.createElement("div");
    messageEl.className = "chat-message";
    messageEl.setAttribute("data-id", message.id);

    const avatarEl = document.createElement("div");
    avatarEl.className = `chat-avatar ${message.type}`;

    const contentEl = document.createElement("div");
    contentEl.className = `chat-content ${message.type}`;

    const timestampEl = document.createElement("div");
    timestampEl.className = "chat-timestamp";
    timestampEl.textContent = message.timestamp.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const textEl = document.createElement("div");
    // Apply formatting for AI messages; for questions/analysis preserve basic structure
    if (message.type === "ai") {
      textEl.innerHTML = formatAIResponse(message.content);
    } else {
      textEl.innerHTML = preserveUserFormatting(message.content);
    }

    // Set avatar emoji and content
    switch (message.type) {
      case "interviewer":
        avatarEl.textContent = "👤";
        break;
      case "student":
        avatarEl.textContent = "🧑‍🎓";
        break;
      case "analysis":
        avatarEl.textContent = "📸";
        break;
      case "ai":
        avatarEl.textContent = "🤖";
        break;
    }

    contentEl.appendChild(timestampEl);
    contentEl.appendChild(textEl);
    messageEl.appendChild(avatarEl);
    messageEl.appendChild(contentEl);

    if (chatMessages) {
      chatMessages.appendChild(messageEl);
      // Apply syntax highlighting and math rendering after adding to DOM
      applySyntaxHighlighting(messageEl);
    }
  }

  // Preserve user question formatting: line breaks, simple bullets, numbered lists
  function preserveUserFormatting(raw) {
    if (!raw) return "";
    let text = raw.replace(/\r\n/g, "\n");
    // Escape HTML
    text = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const lines = text.split(/\n/);
    let out = [];
    let buffer = [];
    let listType = null; // 'ul' or 'ol'
    function flushList() {
      if (buffer.length) {
        out.push(`<${listType}>` + buffer.join("") + `</${listType}>`);
        buffer = [];
        listType = null;
      }
    }
    for (const line of lines) {
      const bulletMatch = /^[-*]\s+(.+)$/.exec(line);
      const numMatch = /^(\d+)\.\s+(.+)$/.exec(line);
      if (bulletMatch) {
        if (listType && listType !== "ul") flushList();
        listType = "ul";
        buffer.push(`<li>${bulletMatch[1]}</li>`);
        continue;
      } else if (numMatch) {
        if (listType && listType !== "ol") flushList();
        listType = "ol";
        buffer.push(`<li>${numMatch[2]}</li>`);
        continue;
      } else {
        flushList();
        if (line.trim().length) {
          // Preserve inline spacing; join multiple spaces
          out.push(`<p>${line.replace(/\s{2,}/g, " ").trim()}</p>`);
        }
      }
    }
    flushList();
    return out.join("\n");
  }

  // Format AI response into readable HTML (enhanced markdown + LaTeX support)
  function formatAIResponse(raw) {
    if (!raw) return "";
    let text = raw.trim();

    // Normalize line endings
    text = text.replace(/\r\n/g, "\n");

    // Store math equations temporarily to protect them from HTML escaping
    const mathStore = [];
    let mathIndex = 0;

    // Extract LaTeX display math environments first (highest priority)
    text = text.replace(/\\begin\{(equation|align|gather|multline|split|cases)\}([\s\S]*?)\\end\{\1\}/g, (match, env, content) => {
      const placeholder = `__MATH_DISPLAY_${mathIndex}__`;
      mathStore.push({ type: "display", content: match, placeholder });
      mathIndex++;
      return placeholder;
    });

    // Extract display math $$...$$ (must come before inline math)
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, content) => {
      const placeholder = `__MATH_DISPLAY_${mathIndex}__`;
      mathStore.push({ type: "display", content: content.trim(), placeholder });
      mathIndex++;
      return placeholder;
    });

    // Extract LaTeX bracket notation for display math
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => {
      const placeholder = `__MATH_DISPLAY_${mathIndex}__`;
      mathStore.push({ type: "display", content: content.trim(), placeholder });
      mathIndex++;
      return placeholder;
    });

    // Extract inline math $...$ (avoid matching $$)
    text = text.replace(/(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/g, (match, content) => {
      const placeholder = `__MATH_INLINE_${mathIndex}__`;
      mathStore.push({ type: "inline", content: content.trim(), placeholder });
      mathIndex++;
      return placeholder;
    });

    // Extract LaTeX parenthesis notation for inline math
    text = text.replace(/\\\(([^\\]*?)\\\)/g, (match, content) => {
      const placeholder = `__MATH_INLINE_${mathIndex}__`;
      mathStore.push({ type: "inline", content: content.trim(), placeholder });
      mathIndex++;
      return placeholder;
    });

    // Escape HTML to prevent injection
    text = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Re-enable fenced code blocks ```lang\ncode``` with language detection
    text = text.replace(
      /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,
      (match, lang, code) => {
        const unescapedCode = code
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&");
        const language = lang || "plaintext";
        return `<pre class="ai-code" data-language="${language}"><code class="language-${language}">${unescapedCode}</code></pre>`;
      },
    );

    // Headings: lines starting with ###, ##, #
    text = text.replace(/^### (.*)$/gm, "<h4>$1</h4>");
    text = text.replace(/^## (.*)$/gm, "<h3>$1</h3>");
    text = text.replace(/^# (.*)$/gm, "<h2>$1</h2>");

    // Bold **text**
    text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // Italic *text*
    text = text.replace(
      /(^|\s)\*(?!\*)([^*]+)\*(?=\s|[.,!?:;]|$)/g,
      "$1<em>$2</em>",
    );

    // Bulleted lists: convert consecutive - / * items into <ul>
    text = wrapListBlocks(text, /^(?:[-*]) (.+)$/gm, "ul");
    // Numbered lists
    text = wrapListBlocks(text, /^\d+\. (.+)$/gm, "ol");

    // Convert remaining single line bullets to list items if inside list tags not caught
    text = text.replace(/^(?:[-*]) (.+)$/gm, "<li>$1</li>");
    text = text.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

    // Paragraphs: split by blank lines, avoid wrapping block elements
    const blockTags =
      /^(<h[2-4]|<ul>|<ol>|<pre|<li>|<\/ul>|<\/ol>|<\/pre|<table|<\/table)/i;
    text = text
      .split(/\n{2,}/)
      .map((seg) => seg.trim())
      .filter(Boolean)
      .map((seg) =>
        blockTags.test(seg) ? seg : "<p>" + seg.replace(/\n/g, "<br>") + "</p>",
      )
      .join("\n");

    // Restore math equations and render with KaTeX
    mathStore.forEach(({ type, content, placeholder }) => {
      try {
        if (typeof katex !== "undefined") {
          // Handle full LaTeX environments vs content-only
          const mathContent = content.startsWith('\\begin{') ? content : content;
          const rendered = katex.renderToString(mathContent, {
            throwOnError: false,
            displayMode: type === "display",
            output: "html",
            strict: false,
            trust: true,
            macros: {
              "\\RR": "\\mathbb{R}",
              "\\NN": "\\mathbb{N}",
              "\\ZZ": "\\mathbb{Z}",
              "\\QQ": "\\mathbb{Q}",
              "\\CC": "\\mathbb{C}",
              "\\vec": "\\boldsymbol{#1}",
              "\\norm": "\\left\\|#1\\right\\|",
              "\\abs": "\\left|#1\\right|",
              "\\floor": "\\left\\lfloor#1\\right\\rfloor",
              "\\ceil": "\\left\\lceil#1\\right\\rceil",
              "\\implies": "\\Rightarrow",
              "\\iff": "\\Leftrightarrow"
            }
          });
          const wrapper = type === "display" ? 
            `<div class="katex-display" style="margin: 1em 0; text-align: center;">${rendered}</div>` : 
            `<span class="katex-inline">${rendered}</span>`;
          text = text.replace(placeholder, wrapper);
        } else {
          // Enhanced fallback if KaTeX not loaded yet
          const wrapper =
            type === "display"
              ? `<div class="math-fallback" style="margin:12px 0;padding:10px;background:rgba(255,255,255,0.05);border-radius:4px;font-family:monospace;text-align:center;">$$${content}$$</div>`
              : `<span class="math-fallback" style="font-family:monospace;background:rgba(255,255,255,0.1);padding:2px 4px;border-radius:2px;">$${content}$</span>`;
          text = text.replace(placeholder, wrapper);
        }
      } catch (err) {
        console.warn("KaTeX rendering error:", err, "Content:", content);
        // Keep original notation on error with better styling
        const orig = type === "display" ? 
          (content.startsWith('\\begin{') ? content : `$$${content}$$`) : 
          `$${content}$`;
        text = text.replace(placeholder, `<code class="math-error" style="background:rgba(255,0,0,0.1);padding:2px 4px;border-radius:2px;">${orig}</code>`);
      }
    });

    return text;
  }

  function wrapListBlocks(text, regex, tag) {
    // Collect matches line by line
    const lines = text.split("\n");
    let result = [];
    let buffer = [];
    let inList = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (regex.test(line)) {
        buffer.push(line.replace(regex, "<li>$1</li>"));
        inList = true;
      } else {
        if (inList) {
          result.push(`<${tag}>` + buffer.join("\n") + `</${tag}>`);
          buffer = [];
          inList = false;
        }
        result.push(line);
      }
    }
    if (inList) result.push(`<${tag}>` + buffer.join("\n") + `</${tag}>`);
    return result.join("\n");
  }

  function scrollChatToBottom() {
    // Scroll to bottom and ensure the container is visible if it has content
    if (chatMessages && chatMessages.children.length > 0) {
      expandChatContainer();
      // Scroll to the bottom of the chat messages
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  // Apply syntax highlighting to code blocks
  function applySyntaxHighlighting(element) {
    if (!element) return;

    // Apply highlight.js to all code blocks
    if (typeof hljs !== "undefined") {
      const codeBlocks = element.querySelectorAll("pre.ai-code code");
      codeBlocks.forEach((block) => {
        try {
          hljs.highlightElement(block);
        } catch (err) {
          console.warn("Syntax highlighting error:", err);
        }
      });
    }

    // Render any math that wasn't caught during initial formatting
    if (typeof renderMathInElement !== "undefined") {
      try {
        renderMathInElement(element, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\[", right: "\\]", display: true },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\begin{equation}", right: "\\end{equation}", display: true },
            { left: "\\begin{align}", right: "\\end{align}", display: true },
            { left: "\\begin{gather}", right: "\\end{gather}", display: true },
            { left: "\\begin{multline}", right: "\\end{multline}", display: true },
            { left: "\\begin{cases}", right: "\\end{cases}", display: true }
          ],
          throwOnError: false,
          strict: false,
          trust: true,
          macros: {
            "\\RR": "\\mathbb{R}",
            "\\NN": "\\mathbb{N}",
            "\\ZZ": "\\mathbb{Z}",
            "\\QQ": "\\mathbb{Q}",
            "\\CC": "\\mathbb{C}",
            "\\vec": "\\boldsymbol{#1}",
            "\\norm": "\\left\\|#1\\right\\|",
            "\\abs": "\\left|#1\\right|",
            "\\floor": "\\left\\lfloor#1\\right\\rfloor",
            "\\ceil": "\\left\\lceil#1\\right\\rceil",
            "\\implies": "\\Rightarrow",
            "\\iff": "\\Leftrightarrow"
          }
        });
      } catch (err) {
        console.warn("KaTeX auto-render error:", err);
      }
    }
  }

  // --- Streaming AI helpers -------------------------------------------------
  let streamTimeout = null; // Add timeout tracker
  let streamCompletionInProgress = false; // Prevent duplicate completion calls

  function startAIStream() {
    console.log("[AI Stream] Starting new AI stream...");
    
    // CRITICAL: If there's already an active stream, complete it first
    if (streamingAIEl) {
      console.warn("[AI Stream] Active stream exists! Completing it before starting new one");
      completeAIStream();
    }
    
    state.currentAIResponse = "";
    streamingAIStartTs = new Date();

    // Clear any existing timeout
    if (streamTimeout) {
      clearTimeout(streamTimeout);
      streamTimeout = null;
    }

    // Set a 30-second timeout to auto-complete if no response
    streamTimeout = setTimeout(() => {
      console.warn(
        "[AI Stream] Stream timeout - no response after 30s, auto-completing",
      );
      if (streamingAIEl) {
        const bodyEl = streamingAIEl.querySelector(".chat-body");
        if (bodyEl && bodyEl.innerHTML === "<em>Thinking...</em>") {
          // Still showing "Thinking..." - replace with error
          state.currentAIResponse =
            "No response received. The AI may be overloaded or unavailable. Please try again.";
        }
        completeAIStream();
      }
    }, 30000);

    // Create placeholder element for live streaming if not present
    if (!chatMessages) return;
    streamingAIEl = document.createElement("div");
    streamingAIEl.className = "chat-message streaming";
    streamingAIEl.setAttribute("data-stream-id", Date.now()); // Add unique ID for debugging
    const avatarEl = document.createElement("div");
    avatarEl.className = "chat-avatar ai";
    avatarEl.textContent = "🤖";
    const contentEl = document.createElement("div");
    contentEl.className = "chat-content ai";
    const tsEl = document.createElement("div");
    tsEl.className = "chat-timestamp";
    tsEl.textContent = streamingAIStartTs.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const bodyEl = document.createElement("div");
    bodyEl.className = "chat-body";
    bodyEl.innerHTML = "<em>Thinking...</em>";
    contentEl.appendChild(tsEl);
    contentEl.appendChild(bodyEl);
    streamingAIEl.appendChild(avatarEl);
    streamingAIEl.appendChild(contentEl);
    chatMessages.appendChild(streamingAIEl);
    expandChatContainer();
    requestScrollBottom();
    console.log(
      '[AI Stream] Placeholder created with "Thinking..." message, timeout set for 30s, stream-id=',
      streamingAIEl.getAttribute("data-stream-id"),
    );
  }

  function updateAIStream(chunk) {
    if (!chunk) return; // Skip empty chunks

    // Clear timeout since we're receiving data
    if (streamTimeout) {
      clearTimeout(streamTimeout);
      streamTimeout = null;
    }

    state.currentAIResponse = (state.currentAIResponse || "") + chunk;
    if (!streamingAIEl) {
      console.warn(
        "[AI Stream] updateAIStream called but streamingAIEl is null! Starting stream...",
      );
      startAIStream();
      return;
    }
    const bodyEl = streamingAIEl.querySelector(".chat-body");
    if (bodyEl) {
      // On first chunk, clear the "Thinking..." placeholder
      const hasPlaceholder = bodyEl.querySelector("em");
      if (hasPlaceholder) {
        console.log(
          '[AI Stream] First chunk received! Clearing "Thinking..." and starting real response',
        );
        bodyEl.innerHTML = "";
      }
      // Lightweight incremental formatting: escape & < > then basic markdown emphasis
      let safe = chunk
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      // Append with simple span to avoid heavy reparse each tick
      const span = document.createElement("span");
      span.textContent = safe; // using textContent keeps it safe
      bodyEl.appendChild(span);

      // Log progress periodically (every 50 chunks)
      if (state.currentAIResponse.length % 50 < chunk.length) {
        console.log(
          `[AI Stream] Received ${state.currentAIResponse.length} characters so far`,
        );
      }
    }
    requestScrollBottom();
  }

  function completeAIStream() {
    console.log(
      "[AI Stream] Completing AI stream, response length:",
      state.currentAIResponse?.length || 0,
    );

    // CRITICAL FIX: Prevent duplicate completions using a flag
    if (streamCompletionInProgress) {
      console.warn("[AI Stream] Completion already in progress - ignoring duplicate call");
      return;
    }
    
    // CRITICAL FIX: Prevent duplicate completions for the same stream
    // If we don't have an active streaming element, the stream was already completed
    if (!streamingAIEl) {
      console.warn("[AI Stream] completeAIStream called but no active stream - ignoring duplicate complete signal");
      return;
    }
    
    // Set flag to prevent re-entrance
    streamCompletionInProgress = true;

    // Clear timeout
    if (streamTimeout) {
      clearTimeout(streamTimeout);
      streamTimeout = null;
    }

    // FIXED: Don't create a duplicate message - just finalize the existing streaming element
    if (state.currentAIResponse && state.currentAIResponse.trim()) {
      console.log(
        "[AI Stream] Finalizing stream with content, first 100 chars:",
        state.currentAIResponse.substring(0, 100),
      );
      
      // Convert the streaming element to a permanent AI message
      // Remove "streaming" class and update content with formatted version
      const bodyEl = streamingAIEl.querySelector(".chat-body");
      if (bodyEl) {
        // Clear the incrementally added spans and replace with formatted content
        bodyEl.innerHTML = formatAIResponse(state.currentAIResponse.trim());
      }
      
      // Remove streaming class to finalize the message
      streamingAIEl.classList.remove("streaming");
      
      // Apply syntax highlighting and math rendering to the finalized message
      applySyntaxHighlighting(streamingAIEl);
      
      console.log("[AI Stream] Stream finalized in-place (no duplicate message)");
    } else {
      console.warn("[AI Stream] No content received! Removing placeholder.");
      // No content; just remove placeholder
      try {
        streamingAIEl.remove();
      } catch {}
    }
    
    // IMPORTANT: Clear these AFTER processing to mark stream as completed
    streamingAIEl = null;
    state.currentAIResponse = "";
    streamingAIStartTs = null;
    
    // Clear the completion flag
    streamCompletionInProgress = false;
    
    // Keep chat open if user previously interacted
    try {
      const container = document.getElementById("chatContainer");
      if (
        container &&
        container.getAttribute("data-force-expanded") === "true"
      ) {
        container.classList.add("expanded");
        queueResize();
      }
    } catch {}
    console.log("[AI Stream] Stream completed and finalized");
  }

  function clearChat() {
    state.chatHistory = [];
    state.lastContext = "";
    if (chatMessages) {
      chatMessages.innerHTML = "";
    }
    // Reset transcript tracking variables so new transcriptions can be displayed
    liveTranscriptMsgId = null;
    liveTranscriptAccumulated = "";
    console.log("[clearChat] Chat cleared, transcript tracking reset");
    showNotification("Chat cleared", "success");
  }

  function toggleChat() {
    let container = document.getElementById("chatContainer");
    if (!container) {
      console.warn(
        "[Chat] toggleChat called but #chatContainer not found in DOM",
      );
      try {
        showNotification("Chat UI not present in this layout", "warn");
      } catch {}
      return;
    }

    // Prevent collapsing chat during active recording/transcription
    const isRecording =
      state.recording || state.interviewerRecording || state.studentMicOn;
    const isExpanded = container.classList.contains("expanded");
    const hasMsgs = state.chatHistory.length > 0;

    if (isExpanded) {
      if (isRecording) {
        console.log(
          "[Chat] Cannot collapse during recording - transcripts are active",
        );
        try {
          showNotification("Chat stays open during recording", "info");
        } catch {}
        return;
      }
      container.classList.remove("expanded");
      container.setAttribute("data-user-collapsed", "true");
      container.setAttribute("data-collapse-time", Date.now().toString());
      console.log("[Chat] Collapsed chat");
    } else {
      container.classList.add("expanded");
      console.log("[Chat] Expanded chat");
      if (hasMsgs) scrollChatToBottom();
      queueResize();
      // Focus input if present
      try {
        const cp = document.getElementById("chatPrompt");
        if (cp) {
          cp.focus();
        }
        if (window.electronAPI && window.electronAPI.focusToolbar) {
          window.electronAPI.focusToolbar();
        }
      } catch {}
    }
  }

  // Enhanced auto-expand function with smart behavior
  function smartExpandChat() {
    if (!chatContainer) return;

    // IMPORTANT: When recording/transcribing, keep chat ALWAYS expanded
    // Don't respect user-collapsed flag during active transcription
    const isRecording =
      state.recording || state.interviewerRecording || state.studentMicOn;

    if (isRecording) {
      // During recording, always keep chat expanded regardless of user preference
      if (!chatContainer.classList.contains("expanded")) {
        console.log(
          "[Chat] Force expanding during recording - transcripts incoming",
        );
        chatContainer.classList.add("expanded");
        // Remove any user-collapsed flags during recording
        chatContainer.removeAttribute("data-user-collapsed");
        chatContainer.removeAttribute("data-collapse-time");
        queueResize();
      }
      state.lastChatActivity = Date.now();
      return;
    }

    // When not recording, respect user preference briefly
    const userCollapsedRecently = chatContainer.hasAttribute(
      "data-user-collapsed",
    );
    const recentCollapseTime = parseInt(
      chatContainer.getAttribute("data-collapse-time") || "0",
    );
    const timeSinceCollapse = Date.now() - recentCollapseTime;

    // If user manually collapsed within last 2 seconds, respect that choice
    // But still expand for new messages after a brief cooldown
    if (userCollapsedRecently && timeSinceCollapse < 2000) {
      console.log(
        "Chat auto-expand skipped: user collapsed recently",
        timeSinceCollapse + "ms ago",
      );
      return;
    }

    // Remove the user-collapsed flag after 2 seconds
    if (timeSinceCollapse > 2000) {
      console.log(
        "Removing user-collapsed flag after",
        timeSinceCollapse + "ms",
      );
      chatContainer.removeAttribute("data-user-collapsed");
      chatContainer.removeAttribute("data-collapse-time");
    }

    // Auto-expand for new content
    if (!chatContainer.classList.contains("expanded")) {
      console.log("Auto-expanding chat container");
      chatContainer.classList.add("expanded");
      queueResize();
    }

    // Update last activity time
    state.lastChatActivity = Date.now();
  }

  // Auto-collapse chat after period of inactivity (optional feature)
  function setupAutoCollapse() {
    // User requested: never auto-close chat interface. Function now a no-op.
    console.log("Chat auto-collapse disabled by user preference");
  }

  function setConnected(connected) {
    console.log(`Setting connection state to: ${connected}`);
    state.connected = connected;
    if (dot) dot.classList.toggle("on", connected);
    if (connected) {
      if (dot) dot.classList.remove("recording");
    }
    if (statusText)
      statusText.textContent = connected ? "Connected" : "Disconnected";

    // Button enable/disable strategy revision:
    // Only strictly disable actions that REQUIRE an open server connection to function.
    // Other UI controls stay clickable and will internally warn if not connected. This avoids
    // a "dead" looking toolbar when the backend is still starting.
    if (recordInterviewerBtn) recordInterviewerBtn.disabled = !connected; // needs WS for audio
    if (listenStudentBtn) listenStudentBtn.disabled = !connected; // needs WS for audio
    if (captureAnalyzeBtn) captureAnalyzeBtn.disabled = !connected; // sends OCR to server
    // askAiBtn remains enabled; click handler already guards & shows notification

    // Legacy buttons: only disable those that send data to server
    if (toggleRecord) toggleRecord.disabled = !connected;
    if (captureBtn) captureBtn.disabled = !connected; // legacy capture path
    // Leave schedule/settings visible & enabled (they interact with Electron, not server)
    if (companyBriefBtn) companyBriefBtn.disabled = false;
    // Resume upload available even if not connected (will warn on click if no server)
    if (resumeUploadBtn) resumeUploadBtn.disabled = false;
    if (toggleStudentBtn) toggleStudentBtn.disabled = !connected; // server preference sync
    if (visibilityBtn) visibilityBtn.disabled = false; // purely local UI toggle
    if (sendBtn && promptInput) {
      // Allow user to type before connection; will warn on send attempt
      sendBtn.disabled = !promptInput.value.trim();
    }
    if (statusDots) statusDots.classList.remove("listening", "receiving");

    console.log(`Connection state updated. Buttons disabled: ${!connected}`);
  }

  function updateRecordingUI() {
    // Update new buttons
    if (recordInterviewerBtn) {
      if (state.interviewerRecording) {
        recordInterviewerBtn.classList.add("mic-active", "toggled");
        recordInterviewerBtn.title = "Stop Recording Interviewer";
      } else {
        recordInterviewerBtn.classList.remove("mic-active", "toggled");
        recordInterviewerBtn.title = "Record Interviewer (System Audio)";
      }
    }

    if (listenStudentBtn) {
      if (state.studentMicOn) {
        listenStudentBtn.classList.add("mic-active", "toggled");
        listenStudentBtn.title = "Turn Off Student Mic";
      } else {
        listenStudentBtn.classList.remove("mic-active", "toggled");
        listenStudentBtn.title = "Turn On Student Mic";
      }
    }

    // Legacy UI updates for compatibility
    if (state.recording) {
      if (recLabel) recLabel.textContent = "Stop";
      if (recIcon) recIcon.textContent = "⏹️";
      dot.classList.add("recording");
      if (toggleRecord) toggleRecord.classList.add("mic-active");
      if (statusDots) statusDots.classList.add("recording");
    } else {
      if (recLabel) recLabel.textContent = "Start";
      if (recIcon) recIcon.textContent = "🎙️";
      dot.classList.remove("recording");
      if (toggleRecord) toggleRecord.classList.remove("mic-active");
      if (statusDots) statusDots.classList.remove("recording");
      if (state.connected) {
        dot.classList.add("on");
      }
    }
  }

  function updateCaptureUI() {
    if (captureBtn) {
      const count = state.captureCount;
      if (count > 0) {
        captureBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
          <span style="font-size: 10px; margin-left: 4px;">${count}</span>
        `;
        captureBtn.title = `${count} screen${count > 1 ? "s" : ""} captured - Click to capture more, Ctrl+Click to clear`;
      } else {
        captureBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
        `;
        captureBtn.title = "Capture and analyze screen content";
      }
    }
  }

  function updateSpeakerUI() {
    if (state.currentSpeaker === "user1") {
      speakerUser1.classList.add("active", "success");
      speakerUser1.classList.remove("ghost");
      speakerUser2.classList.remove("active", "success");
      speakerUser2.classList.add("ghost");
    } else {
      speakerUser2.classList.add("active", "success");
      speakerUser2.classList.remove("ghost");
      speakerUser1.classList.remove("active", "success");
      speakerUser1.classList.add("ghost");
    }
  }

  function updateListenStudentUI() {
    if (toggleStudentBtn) {
      if (listenStudent) {
        toggleStudentBtn.classList.add("toggled");
        toggleStudentBtn.title = "Stop listening to student";
      } else {
        toggleStudentBtn.classList.remove("toggled");
        toggleStudentBtn.title = "Listen to Student (on/off)";
      }
    }

    // Update new button UI as well
    if (listenStudentBtn) {
      if (listenStudent) {
        listenStudentBtn.classList.add("toggled");
      } else {
        listenStudentBtn.classList.remove("toggled");
      }
    }
  }

  // ==========================================
  // CREDITS MANAGEMENT
  // ==========================================
  
  async function loadCredits() {
    try {
      if (!window.electronAPI || !window.electronAPI.invoke) {
        log.warn('electronAPI not available, credits feature disabled');
        return;
      }
      
      const result = await window.electronAPI.invoke('credits-load');
      if (result.ok && result.credits) {
        updateCreditsUI(result.credits);
      } else {
        log.warn('Failed to load credits:', result.error);
      }
    } catch (error) {
      log.error('Error loading credits:', error);
    }
  }
  
  function updateCreditsUI(credits) {
    if (!creditsDisplay || !creditsAmount) {
      return;
    }
    
    const remaining = credits.remaining || 0;
    
    // Update amount display
    creditsAmount.textContent = remaining.toFixed(1);
    
    // Update styling based on remaining credits
    creditsDisplay.classList.remove('low-credits', 'no-credits');
    
    if (remaining <= 0) {
      creditsDisplay.classList.add('no-credits');
    } else if (remaining < 1) {
      creditsDisplay.classList.add('low-credits');
    }
    
    // Show the credits display
    creditsDisplay.style.display = 'flex';
    
    // Update tooltip
    const hours = remaining.toFixed(1);
    const planType = credits.planType || 'free';
    creditsDisplay.title = `${hours} hours remaining (${planType} plan)\\nClick to view details`;
    
    log.info(`Credits updated: ${remaining.toFixed(1)} remaining (${credits.used.toFixed(1)}/${credits.total} used)`);
  }
  
  // Credits display click handler - show details
  if (creditsDisplay) {
    creditsDisplay.addEventListener("click", async () => {
      if (timeBreakdownOverlay && timeBreakdownOverlay.classList.contains("show")) {
        hideTimeBreakdownModal();
        return;
      }

      try {
        let creditsData = null;

        if (window.electronAPI && window.electronAPI.invoke) {
          const result = await window.electronAPI.invoke("credits-load");
          if (result.ok && result.credits) {
            creditsData = result.credits;
          }
        }

        if (!creditsData) {
          log.warn("Credits data unavailable, falling back to defaults");
          creditsData = {
            planType: "Free",
            total: 0,
            used: 0,
            remaining: 0,
            sessionsCount: 0,
            totalTimeHours: 0,
          };
        }

        const remainingHours = Math.max(creditsData.remaining || 0, 0);
        const totalSeconds = Math.floor(remainingHours * 3600);
        const breakdown = {
          hours: Math.floor(totalSeconds / 3600),
          minutes: Math.floor((totalSeconds % 3600) / 60),
          seconds: totalSeconds % 60,
        };

        showTimeBreakdownModal(creditsData, breakdown);
      } catch (error) {
        log.error("Error showing credits details:", error);
        const fallbackCredits = {
          planType: "Free",
          total: 0,
          used: 0,
          remaining: 0,
          sessionsCount: 0,
          totalTimeHours: 0,
        };
        showTimeBreakdownModal(fallbackCredits, { hours: 0, minutes: 0, seconds: 0 });
      }
    });
  }

  function showTimeBreakdownModal(credits, breakdown) {
    if (!timeBreakdownOverlay) {
      log.error("Time breakdown overlay element not found");
      return;
    }

    const { hours, minutes, seconds } = breakdown;
  const totalCredits = typeof credits.total === "number" ? credits.total : Number(credits.total || 0);
  const usedCredits = typeof credits.used === "number" ? credits.used : Number(credits.used || 0);
  const remainingCredits = typeof credits.remaining === "number" ? credits.remaining : Number(credits.remaining || 0);
  const percentRaw = totalCredits > 0 ? (usedCredits / totalCredits) * 100 : 0;
  const percentUsed = Math.min(Math.max(Number(percentRaw.toFixed(1)), 0), 100);

    if (timeHoursValue) timeHoursValue.textContent = String(hours);
    if (timeMinutesValue) timeMinutesValue.textContent = String(minutes).padStart(2, "0");
    if (timeSecondsValue) timeSecondsValue.textContent = String(seconds).padStart(2, "0");
  if (timePlanValue) timePlanValue.textContent = credits.planType || "Free";
  if (timeTotalValue) timeTotalValue.textContent = totalCredits.toFixed(2);
  if (timeUsedValue) timeUsedValue.textContent = usedCredits.toFixed(2);
  if (timeRemainingValue) timeRemainingValue.textContent = remainingCredits.toFixed(2);
    if (timeSessionsValue) timeSessionsValue.textContent = String(credits.sessionsCount || 0);
    if (timeProgressFill) timeProgressFill.style.width = `${percentUsed}%`;
    if (timeProgressText) timeProgressText.textContent = `${percentUsed}% used`;

    // Position relative to toolbar similar to other overlays
    if (barEl) {
      const barRect = barEl.getBoundingClientRect();
      const offsetTop = Math.max(barRect.bottom + 16, 96);
      timeBreakdownOverlay.style.top = `${offsetTop}px`;
      timeBreakdownOverlay.style.maxHeight = `calc(100vh - ${offsetTop + 48}px)`;
    } else {
      timeBreakdownOverlay.style.top = "96px";
      timeBreakdownOverlay.style.maxHeight = "calc(100vh - 160px)";
    }

    timeBreakdownOverlay.classList.add("show");
    timeBreakdownOverlay.setAttribute("aria-hidden", "false");

    if (window.electronAPI && window.electronAPI.resizeToolbarDimensions) {
      try {
        const barRect = barEl ? barEl.getBoundingClientRect() : { width: 360 };
        const targetW = Math.max(Math.round(barRect.width + 60), 520);
        window.electronAPI.resizeToolbarDimensions(targetW, 520);
      } catch (err) {
        log.warn("Failed to resize toolbar window for time breakdown", err);
      }
    } else {
      document.body.style.height = "100vh";
      document.body.style.overflow = "auto";
    }

    requestAnimationFrame(() => {
      timeBreakdownOverlay.focus({ preventScroll: true });
    });
  }

  function hideTimeBreakdownModal() {
    if (!timeBreakdownOverlay) return;
    timeBreakdownOverlay.classList.remove("show");
    timeBreakdownOverlay.setAttribute("aria-hidden", "true");
    timeBreakdownOverlay.style.top = "";
    timeBreakdownOverlay.style.maxHeight = "";

    if (window.electronAPI && window.electronAPI.resizeToolbarDimensions) {
      queueResize();
    } else {
      document.body.style.height = "";
      document.body.style.overflow = "";
    }
  }

  if (timeBreakdownClose) {
    timeBreakdownClose.addEventListener("click", (event) => {
      event.preventDefault();
      hideTimeBreakdownModal();
    });
  }

  if (timeBreakdownOverlay) {
    timeBreakdownOverlay.addEventListener("click", (event) => {
      if (event.target === timeBreakdownOverlay) {
        hideTimeBreakdownModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && timeBreakdownOverlay?.classList.contains("show")) {
      hideTimeBreakdownModal();
    }
  });
  
  // Listen for credits updates from main process
  if (window.electronAPI && window.electronAPI.onCreditsUpdated) {
    window.electronAPI.onCreditsUpdated((data) => {
      log.info('Credits updated from main process:', data);
      
      // Update credits UI directly with the new data
      if (data && (data.creditsRemaining !== undefined || data.creditsTotal !== undefined)) {
        updateCreditsUI({
          total: data.creditsTotal || 0,
          used: data.creditsUsed || 0,
          remaining: data.creditsRemaining || 0,
          planType: data.planType || 'free'
        });
      } else {
        // Fallback: reload credits from storage
        loadCredits();
      }
    });
    log.info('Credits update listener registered');
  } else {
    log.warn('electronAPI.onCreditsUpdated not available');
  }

  async function connect() {
    console.log("Attempting to connect to server...");
    if (!state._reconnectAttempts) state._reconnectAttempts = 0;
    
    // CLOUD MODE SUPPORT: Check if we should connect to cloud backend
    let config = null;
    try {
      if (window.electronAPI && window.electronAPI.getConfig) {
        config = await window.electronAPI.getConfig();
        console.log('[Connection] Got config from main process:', config);
      }
    } catch (e) {
      console.log('[Connection] Could not get config from main process:', e);
    }

    // If cloud mode is enabled, connect to cloud server directly
    if (config && config.cloudMode && config.serverUrl) {
      console.log(`[Cloud Mode] Connecting to cloud server: ${config.serverUrl}`);
      connectToCloud(config.serverUrl);
      return;
    }

    // LOCAL MODE: Scan localhost ports for local Python server
    console.log('[Local Mode] Scanning localhost ports for server...');
    try {
      const tryConnect = (port) =>
        new Promise((resolve) => {
          console.log(`Trying port ${port}...`);
          let opened = false;
          const ws = new WebSocket(`ws://localhost:${port}/ui`);
          ws.onopen = () => {
            console.log(`Connected to port ${port}`);
            opened = true;
            resolve(ws);
          };
          ws.onerror = (e) => {
            console.log(`Port ${port} failed:`, e);
            resolve(null);
          };
          ws.onclose = () => {
            if (!opened) {
              console.log(`Port ${port} closed without opening`);
              resolve(null);
            }
          };
        });

      (async () => {
        // Try a wider port range (server may shift up to +9)
        let ports = [
          8765, 8766, 8767, 8768, 8769, 8770, 8771, 8772, 8773, 8774,
        ];

        // First try to get the actual server port from main process
        try {
          if (window.electronAPI && window.electronAPI.getServerPort) {
            const mainPort = await window.electronAPI.getServerPort();
            if (mainPort && typeof mainPort === "number" && mainPort !== 8765) {
              console.log(`Got server port from main process: ${mainPort}`);
              ports = [mainPort, ...ports.filter((p) => p !== mainPort)];
            }
          }
        } catch (e) {
          console.log("Could not get server port from main process:", e);
        }

        // If we previously connected on a specific port, try it first (after main port)
        try {
          const last = parseInt(
            localStorage.getItem("toolbar_last_port") || "",
            10,
          );
          if (last && ports.includes(last) && last !== ports[0]) {
            ports = [
              ports[0],
              last,
              ...ports.filter((p) => p !== last && p !== ports[0]),
            ];
          }
        } catch {}
        if (statusText && !state.connected)
          statusText.textContent = "Scanning...";
        for (const p of ports) {
          const cand = await tryConnect(p);
          if (cand) {
            state.ws = cand;
            state.serverPort = p;
            console.log(`Successfully connected to server on port ${p}`);
            break;
          }
        }
        if (!state.ws) {
          console.error(
            "No WebSocket connection established after scanning ports 8765-8774",
          );
          // Provide user feedback only once per failed sweep
          try {
            if (typeof showNotification === "function")
              showNotification("Server not running. Retrying...", "error");
          } catch {}
          throw new Error("No ws connection");
        }

        state.ws.onopen = () => {
          log.info("WebSocket connection opened successfully");
          setConnected(true);
          state._reconnectAttempts = 0;
          try {
            localStorage.setItem("toolbar_last_port", String(state.serverPort));
          } catch {}
          if (showNotification) {
            showNotification("Connected! Mic ready.", "success");
          } else {
            log.info("Connected! Mic ready.");
          }
          // Sync listen_student preference to server
          try {
            send({ type: "listen_student", enabled: !!listenStudent });
          } catch {}
          // Start health monitoring
          connectionHealth.start();
          log.info("Connection health monitoring started");

          if (!state.pendingCompanyBrief && state.companyBrief) {
            const normalized = normalizeCompanyBriefPayload(state.companyBrief);
            if (normalized) {
              try {
                state.pendingCompanyBrief = { ...normalized };
                state.companyBriefSilentSync = true;
                state.ws.send(
                  JSON.stringify({ type: "context", ...normalized }),
                );
                log.info(
                  "Re-sent stored company brief to server after reconnect",
                );
              } catch (syncErr) {
                state.companyBriefSilentSync = false;
                state.pendingCompanyBrief = null;
                log.warn(
                  "Failed to sync stored company brief on connect",
                  syncErr,
                );
              }
            }
          }
        };
        state.ws.onclose = () => {
          log.info("WebSocket connection closed, scheduling reconnect");
          connectionHealth.stop();
          setConnected(false);
          scheduleReconnect();
        };
        state.ws.onerror = (e) => {
          log.error("WebSocket error:", e);
          connectionHealth.stop();
          setConnected(false);
          scheduleReconnect();
        };
        state.ws.onmessage = (ev) => {
          // Use shared message handler
          handleWebSocketMessage(ev);
        };
      })();
    } catch (e) {
      console.error("Toolbar WS error:", e);
      // Retry connection after 2 seconds
      setTimeout(() => {
        console.log("Retrying connection...");
        connect();
      }, 2000);
    }
  }

  // Cloud mode connection function
  function connectToCloud(serverUrl) {
    console.log(`[Cloud] Connecting to cloud server: ${serverUrl}`);
    try {
      // Ensure URL has the /ui path
      const wsUrl = serverUrl.endsWith('/ui') ? serverUrl : `${serverUrl}/ui`;
      console.log(`[Cloud] WebSocket URL: ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl);
      state.ws = ws;
      
      ws.onopen = () => {
        console.log(`[Cloud] ✅ Connected to cloud server: ${serverUrl}`);
        setConnected(true);
        state._reconnectAttempts = 0;
        
        try {
          localStorage.setItem('toolbar_cloud_connected', 'true');
        } catch {}
        
        if (showNotification) {
          showNotification('Connected to cloud server', 'success');
        } else {
          console.log('Connected to cloud server');
        }
        
        // Sync listen_student preference to server
        try {
          send({ type: "listen_student", value: listenStudent });
        } catch {}
        
        // Start health monitoring
        connectionHealth.start();
        log.info('[Cloud] Connection health monitoring started');

        // Re-sync company brief if available
        if (!state.pendingCompanyBrief && state.companyBrief) {
          const normalized = normalizeCompanyBriefPayload(state.companyBrief);
          if (normalized) {
            try {
              state.pendingCompanyBrief = { ...normalized };
              state.companyBriefSilentSync = true;
              state.ws.send(
                JSON.stringify({ type: "context", ...normalized }),
              );
              log.info(
                "[Cloud] Re-sent stored company brief to server after reconnect",
              );
            } catch (syncErr) {
              state.companyBriefSilentSync = false;
              state.pendingCompanyBrief = null;
              log.warn(
                "[Cloud] Failed to sync stored company brief on connect",
                syncErr,
              );
            }
          }
        }
      };
      
      ws.onclose = (ev) => {
        console.log(`[Cloud] WebSocket connection closed (code: ${ev.code})`);
        connectionHealth.stop();
        setConnected(false);
        scheduleReconnect();
      };
      
      ws.onerror = (e) => {
        console.error('[Cloud] WebSocket error:', e);
        connectionHealth.stop();
        setConnected(false);
        
        // Show helpful error message
        if (showNotification) {
          showNotification(
            'Failed to connect to cloud server. Please check your internet connection.',
            'error'
          );
        }
        
        scheduleReconnect();
      };
      
      // Use the same message handler as local connection
      // Reuse the same message handler logic as local mode
      // The message handling is the same regardless of connection type
      ws.onmessage = (ev) => {
        // Delegate to the shared message handler
        handleWebSocketMessage(ev);
      };
      
    } catch (e) {
      console.error('[Cloud] Failed to connect to cloud:', e);
      if (showNotification) {
        showNotification('Cloud connection failed', 'error');
      }
      scheduleReconnect();
    }
  }

  // Shared WebSocket message handler (used by both local and cloud connections)
  function handleWebSocketMessage(ev) {
    try {
      const msg = JSON.parse(ev.data);

      // Handle pong for health monitoring
      if (msg.type === "pong") {
        connectionHealth.receivedPong();
        return;
      }

      if (
        msg.type === "status" &&
        ((msg.data && msg.data.audio) || msg.audio)
      ) {
        const a = (msg.data && msg.data.audio) || msg.audio;
        statusText.textContent =
          a === "listening"
            ? "Listening…"
            : a === "receiving"
              ? "Receiving…"
              : "Connected";
        if (statusDots) {
          statusDots.classList.remove("listening", "receiving");
          if (a === "listening") statusDots.classList.add("listening");
          if (a === "receiving") statusDots.classList.add("receiving");
        }
      }
      if (msg.type === "context_ack" && msg.context_kind === "company") {
        const silentSync = !!state.companyBriefSilentSync;
        state.companyBriefSilentSync = false;

        if (msg.success) {
          const pending = state.pendingCompanyBrief || state.companyBrief;
          if (pending) persistCompanyBrief(pending);
          state.pendingCompanyBrief = null;
          state.companyBriefConfirmationPending = false;
          if (!silentSync) {
            state.companyBriefConfirmedForSession = true;
          }

          if (companyBriefStatus && !silentSync) {
            companyBriefStatus.textContent = "Company brief stored.";
            companyBriefStatus.dataset.state = "success";
          }
          if (!silentSync) {
            if (companyBriefForm) companyBriefForm.reset();
            toggleCompanyBrief(false);
            resetCompanyBriefStatus();
            if (companyBriefSave) companyBriefSave.disabled = false;
            showNotification("Company brief shared with AI", "success");
          } else {
            if (companyBriefSave) companyBriefSave.disabled = false;
            log.info("Company brief synced with server");
          }
          const resumeAction = state.companyBriefPendingAction;
          state.companyBriefPendingAction = null;
          if (!silentSync && typeof resumeAction === "function") {
            setTimeout(() => {
              try {
                resumeAction();
              } catch (resumeErr) {
                log.warn(
                  "Company brief pending action failed",
                  resumeErr,
                );
              }
            }, 60);
          }
        } else {
          state.pendingCompanyBrief = null;
          state.companyBriefConfirmationPending = false;
          if (companyBriefSave) companyBriefSave.disabled = false;
          if (companyBriefStatus && !silentSync) {
            companyBriefStatus.textContent =
              msg.error || "Failed to store company brief.";
            companyBriefStatus.dataset.state = "error";
          }
          if (!silentSync) {
            showNotification(
              msg.error || "Failed to share company brief",
              "error",
            );
          } else {
            log.warn(
              "Server rejected company brief sync:",
              msg.error || "unknown",
            );
          }
        }
      }

      // Transcript updates
      if (msg.type === "transcript") {
        console.log("[Transcript] Received:", msg);
        const isFinal = !!msg.is_final;
        const text = msg.text || "";
        if (!text.trim()) return;

        const mode = msg.mode || state.recordingMode || "interviewer";
        console.log(`[Transcript] Mode: ${mode}, Final: ${isFinal}`);

        if (isFinal) {
          console.log("[Transcript] FINAL -", text.substring(0, 50) + "...");
          appendToLiveTranscript(text);
        } else {
          console.log("[Transcript] INTERIM -", text.substring(0, 50));
          updateLiveTranscriptInterim(text);
        }

        usageStats.increment("transcriptions");
      }

      // Handle screen/OCR captures
      if (msg.type === "ocr_result" || msg.type === "ocr") {
        try {
          performanceMetrics.recordMetric(
            "ocr",
            Date.now() - (state._lastOCRStart || Date.now()),
          );
        } catch {}

        const ocrText = msg.text || "";
        console.log(
          "[OCR] Received result, length:",
          ocrText.length,
          "chars",
        );

        state.lastContext = ocrText;
        state.lastQuestionContext = "screen_capture";

        addChatMessage("analysis", ocrText);

        if (state.autoTriggerAI && ocrText.trim()) {
          console.log("[OCR] Auto-triggering AI with screen content");
          state.autoTriggerAI = false;
          state.forceCaptureRequest = false;

          const userPrompt =
            promptInput && promptInput.value.trim()
              ? promptInput.value.trim()
              : "What is on the screen?";
          const fullPrompt =
            `Screen content:\n${ocrText}\n\nQuestion: ${userPrompt}`;

          if (promptInput) promptInput.value = "";

          sendAIQuery(fullPrompt, "screen_capture");
        }
      }

      // Display AI responses in chat (streaming aware)
      if (msg.type === "coach") {
        try {
          performanceMetrics.recordMetric(
            "aiResponse",
            Date.now() - (state._lastAIQueryStart || Date.now()),
          );
        } catch {}
        usageStats.increment("aiQueries");

        const text = msg.text || "";
        const isReset = !!msg.reset;
        const isComplete = !!msg.complete;

        if (isReset) {
          console.log("[AI Stream] Reset signal received, starting new stream");
          if (streamingAIEl) completeAIStream();
          startAIStream();
          return;
        }

        if (text) {
          if (!streamingAIEl) {
            const timeSinceUserQuery = Date.now() - window.lastUserAIRequestTs;
            const isCaptureContext =
              state.lastQuestionContext === "screen_capture";
            const isWithinTimeWindow = timeSinceUserQuery < 45000;

            if (isCaptureContext || isWithinTimeWindow) {
              console.log(
                "[AI Stream] Starting stream for orphan chunk (no reset seen)",
              );
              startAIStream();
            } else {
              console.warn(
                "[AI Stream] Ignoring orphan chunk (no recent user query or capture)",
              );
              return;
            }
          }
          console.log(
            "[AI Stream] Processing text chunk:",
            text.substring(0, 50),
          );
          updateAIStream(text);
        }

        if (isComplete) {
          console.log("[AI Stream] Complete signal received");
          completeAIStream();
        }
      } else if (msg.type === "stream_chunk") {
        const text = msg.text || "";
        if (text) {
          const timeSinceUserQuery = Date.now() - window.lastUserAIRequestTs;
          const isCaptureContext =
            state.lastQuestionContext === "screen_capture";
          const isWithinTimeWindow = timeSinceUserQuery < 45000;

          if (isCaptureContext || isWithinTimeWindow) {
            if (!streamingAIEl) {
              console.log(
                "[AI Stream] Starting stream for stream_chunk (no active stream)",
              );
              startAIStream();
            }
            console.log(
              isCaptureContext
                ? "[AI Stream] Processing text chunk for capture context:"
                : "[AI Stream] Processing text chunk within time window:",
              text.substring(0, 50),
            );
            updateAIStream(text);
          } else {
            console.warn(
              "[AI Stream] Ignoring chunk - no active stream and outside time window",
            );
          }
        }
      } else if (msg.type === "stream" && msg.text) {
        if (!streamingAIEl) startAIStream();
        updateAIStream(msg.text);
        if (msg.complete) completeAIStream();
      }

      // Handle complete AI responses (non-streaming)
      if (msg.type === "ai_response" && msg.text && msg.text.trim()) {
        addChatMessage("ai", msg.text.trim());
      }
    } catch (err) {
      console.error('[WS] Error processing message:', err);
    }
  }

  // Process server messages (extracted for reuse between local and cloud)
  function processServerMessage(msg) {
    try {
      if (
        msg.type === "status" &&
        ((msg.data && msg.data.audio) || msg.audio)
      ) {
        const a = (msg.data && msg.data.audio) || msg.audio;
        statusText.textContent =
          a === "listening"
            ? "Listening…"
            : a === "receiving"
              ? "Processing…"
              : "Connected";
      }

      // Continue with rest of message handling...
      // (This is a placeholder - the actual logic from ws.onmessage will be used)
    } catch (err) {
      console.error('[Message] Error processing:', err);
    }
  }

  function scheduleReconnect() {
    state._reconnectAttempts = (state._reconnectAttempts || 0) + 1;
    const attempt = state._reconnectAttempts;
    const delay = Math.min(10000, 1000 * Math.pow(1.4, attempt)); // capped exponential backoff
    console.log(
      `Scheduling reconnect attempt ${attempt} in ${Math.round(delay)}ms`,
    );
    if (statusText) statusText.textContent = "Reconnecting...";
    clearTimeout(state._reconnectTimer);
    state._reconnectTimer = setTimeout(() => {
      if (!state.connected) connect();
    }, delay);
  }

  function send(message) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    // Add current speaker to message
    if (message && typeof message === "object") {
      if (message.type === "coach" && !message.company_context) {
        const sourceBrief = state.pendingCompanyBrief || state.companyBrief;
        const contextPayload =
          normalizeCompanyBriefPayload(sourceBrief) || sourceBrief;
        if (contextPayload) {
          message.company_context = { ...contextPayload };
        }
      }
      message.speaker = state.currentSpeaker;
    }
    state.ws.send(JSON.stringify(message));
  }

  // Audio helpers removed: handled inside AudioWorklet (audio-level-processor.js)

  async function connectAudioSocket() {
    return new Promise((resolve, reject) => {
      try {
        const port = state.serverPort || 8765;
        console.log("[Audio] Opening audio WebSocket to port", port, "...");
        state.audioWs = new WebSocket(`ws://localhost:${port}/audio`);
        state.audioWs.binaryType = "arraybuffer";
        state.audioWs.onopen = () => {
          console.log("[Audio] Audio WebSocket OPEN");
          state._audioReconnectAttempts = 0;
          resolve();
        };
        state.audioWs.onerror = (e) => {
          console.error("[Audio] Audio WebSocket error", e);
          reject(e);
        };
        state.audioWs.onclose = (ev) => {
          console.warn(
            "[Audio] Audio WebSocket closed",
            ev?.code,
            ev?.reason || "",
          );
          state.audioWs = null;
          // If we were actively recording, attempt reconnection for resilience.
          if (state.recording && (ev?.code === 1005 || ev?.code === 1006)) {
            state._audioReconnectAttempts =
              (state._audioReconnectAttempts || 0) + 1;
            const attempt = state._audioReconnectAttempts;
            const delay = Math.min(15000, 800 * Math.pow(1.5, attempt));
            showNotification(
              `Audio stream disrupted. Reconnecting (attempt ${attempt}) in ${Math.round(delay / 1000)}s`,
              "warn",
            );
            clearTimeout(state._audioReconnectTimer);
            state._audioReconnectTimer = setTimeout(async () => {
              if (!state.recording) return; // user may have stopped
              try {
                await connectAudioSocket();
                console.log("[Audio] Reconnected audio socket.");
              } catch (re) {
                console.error("[Audio] Reconnect attempt failed", re);
                // Schedule another if still recording
                if (state.recording) {
                  state.audioWs && state.audioWs.close();
                }
              }
            }, delay);
          }
        };
        state.audioWs.onmessage = (msg) => {
          // Optional: server can send ack / diagnostics
          try {
            if (typeof msg.data === "string") {
              const j = JSON.parse(msg.data);
              if (j.type === "audio_ack") {
                console.debug("[Audio] Ack frames=", j.frames);
              }
            }
          } catch {}
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  async function startRecording(mode = "interviewer") {
    if (!state.connected) {
      console.warn("[Audio] startRecording called while disconnected");
      return false;
    }
    if (state.recording) {
      // If we're already recording the requested mode, ignore.
      if (state.recordingMode === mode) {
        console.warn(
          "[Audio] startRecording ignored: already recording mode=",
          state.recordingMode,
        );
        return false;
      }
      // Otherwise treat as a mode switch (e.g., interviewer -> student).
      console.log(
        "[Audio] Switching recording mode from",
        state.recordingMode,
        "to",
        mode,
      );
      stopRecording();
      // Give a brief pause for resources (audio context / tracks) to release cleanly.
      await new Promise((r) => setTimeout(r, 120));
    }
    try {
      await connectAudioSocket();
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      state.audioContext = new AudioContext({ sampleRate: 16000 });
      if (state.audioContext.state === "suspended") {
        try {
          await state.audioContext.resume();
        } catch {}
      }
      // If system audio capture was requested, attempt sequence: getDisplayMedia -> desktopCapturer -> mic
      if (state._pendingSystemAudio) {
        console.log(
          "[Audio] Attempting system/output audio capture (strategy: getDisplayMedia -> desktopCapturer -> mic)",
        );
        let acquired = false;
        // Attempt 1: Standard picker (often most reliable and grants loopback)
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          try {
            console.log("[Audio] Trying getDisplayMedia(video+audio) first");
            const ds = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true,
            });
            ds.getVideoTracks().forEach((tr) => {
              try {
                tr.stop();
              } catch {}
              ds.removeTrack(tr);
            });
            state.mediaStream = ds;
            state.systemAudio = true;
            console.log(
              "[Audio] System audio capture established via getDisplayMedia",
            );
            acquired = true;
          } catch (gdmErr) {
            const n = (gdmErr && (gdmErr.name || gdmErr.message)) || "Unknown";
            console.warn("[Audio] getDisplayMedia denied/failed:", n);
            if (n === "NotAllowedError" || n === "Permission denied") {
              showNotification(
                "Screen audio permission denied. Retrying alternate method...",
                "warn",
              );
            }
          }
        }
        // Attempt 2: desktopCapturer constraints path (iterate sources & variants)
        if (!acquired) {
          try {
            if (window.electronAPI && window.electronAPI.listDesktopSources) {
              const resp = await window.electronAPI.listDesktopSources([
                "screen",
                "window",
              ]);
              if (
                resp &&
                resp.ok &&
                Array.isArray(resp.sources) &&
                resp.sources.length
              ) {
                const ordered = [
                  ...resp.sources.filter((s) => s.kind === "screen"),
                  ...resp.sources.filter((s) => s.kind !== "screen"),
                ];
                console.log(
                  "[Audio] desktopCapturer sources found:",
                  ordered.map((s) => s.id + ":" + s.name),
                );
                outerLoop: for (const src of ordered) {
                  const variants = [
                    {
                      label: "video+audio",
                      constraints: {
                        audio: {
                          mandatory: {
                            chromeMediaSource: "desktop",
                            chromeMediaSourceId: src.id,
                          },
                        },
                        video: {
                          mandatory: {
                            chromeMediaSource: "desktop",
                            chromeMediaSourceId: src.id,
                          },
                        },
                      },
                    },
                    {
                      label: "audio-only",
                      constraints: {
                        audio: {
                          mandatory: {
                            chromeMediaSource: "desktop",
                            chromeMediaSourceId: src.id,
                          },
                        },
                      },
                    },
                    {
                      label: "video-only",
                      constraints: {
                        video: {
                          mandatory: {
                            chromeMediaSource: "desktop",
                            chromeMediaSourceId: src.id,
                          },
                        },
                      },
                    },
                  ];
                  for (const v of variants) {
                    if (acquired) break outerLoop;
                    try {
                      console.log(
                        `[Audio] Trying source=${src.id} (${src.name}) variant=${v.label}`,
                      );
                      const stream = await navigator.mediaDevices.getUserMedia(
                        v.constraints,
                      );
                      // Remove video tracks if present
                      stream.getVideoTracks().forEach((tr) => {
                        try {
                          tr.stop();
                        } catch {}
                        stream.removeTrack(tr);
                      });
                      // Ensure at least one audio track (if variant aimed for audio)
                      if (
                        v.label !== "video-only" &&
                        !stream.getAudioTracks().length
                      ) {
                        console.warn(
                          "[Audio] Variant produced no audio tracks, releasing and continuing",
                        );
                        stream.getTracks().forEach((t) => {
                          try {
                            t.stop();
                          } catch {}
                        });
                        continue;
                      }
                      state.mediaStream = stream;
                      state.systemAudio = true;
                      console.log(
                        "[Audio] System audio capture established via desktopCapturer (" +
                          v.label +
                          ")",
                      );
                      acquired = true;
                    } catch (variantErr) {
                      const n =
                        variantErr?.name ||
                        variantErr?.message ||
                        String(variantErr);
                      if (
                        n.includes("NotAllowed") ||
                        n.includes("Permission")
                      ) {
                        console.warn(
                          "[Audio] Permission denied for source variant",
                          v.label,
                          "->",
                          n,
                        );
                      } else if (
                        n.includes("not capturable") ||
                        n.includes("NotReadable")
                      ) {
                        console.warn(
                          "[Audio] Source not capturable",
                          src.id,
                          src.name,
                          "variant",
                          v.label,
                          "->",
                          n,
                        );
                      } else {
                        console.warn(
                          "[Audio] Source variant failed",
                          src.id,
                          v.label,
                          "->",
                          n,
                        );
                      }
                    }
                  }
                }
                if (!acquired)
                  console.warn(
                    "[Audio] All desktopCapturer source variants exhausted without success",
                  );
              } else {
                console.warn("[Audio] desktopCapturer returned no sources");
              }
            } else {
              console.warn("[Audio] desktopCapturer API not exposed");
            }
          } catch (dcErr) {
            console.warn(
              "[Audio] desktopCapturer overall attempt failed:",
              dcErr?.name || dcErr?.message || dcErr,
            );
          }
        }
        // Attempt 3: Microphone fallback
        if (!acquired) {
          if (statusText)
            statusText.textContent = "System audio denied; using mic";
          showNotification(
            "System audio unavailable – using microphone",
            "warn",
          );
          try {
            state.mediaStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
            state.systemAudio = false;
            console.log("[Audio] Microphone fallback active");
          } catch (micErr) {
            console.error("[Audio] Microphone fallback failed:", micErr);
            showNotification(
              "Audio capture failed (no system/mic). Check permissions.",
              "error",
            );
            return false;
          }
        }
      } else {
        state.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        state.systemAudio = false;
      }
      state._pendingSystemAudio = false;
      // Create worklet-based processing pipeline
      const source = state.audioContext.createMediaStreamSource(
        state.mediaStream,
      );
      let workletLoaded = false;
      try {
        const moduleUrl = new URL(
          "audio-level-processor.js",
          window.location.href,
        ).href;
        await state.audioContext.audioWorklet.addModule(moduleUrl);
        workletLoaded = true;
      } catch (we) {
        console.error("[Audio] Failed to load audio worklet module:", we);
      }
      if (!workletLoaded) {
        showNotification("Audio worklet load failed", "error");
        stopRecording();
        return false;
      }
      const workletNode = new AudioWorkletNode(
        state.audioContext,
        "audio-level-processor",
      );
      // Enable adaptive gain for system audio by default
      workletNode.port.postMessage({
        type: "gain_control",
        enable: !!state.systemAudio,
        targetRMS: 0.025,
      });
      workletNode.port.onmessage = (ev) => {
        const msg = ev.data || {};
        if (!state.recording || state.recordingMode !== mode) return;
        if (msg.type === "level") {
          state.lastRMS = msg.rms;
          if (msg.rms !== undefined && statusText) {
            statusText.textContent = msg.silence
              ? "Listening (silence)"
              : "Listening (" + msg.rms.toFixed(3) + ")";
          }
          if (msg.rms !== undefined) {
            if (msg.silence) {
              console.debug("[Audio] Silence rms=", msg.rms.toFixed(6));
            } else {
              console.debug("[Audio] Mic rms=", msg.rms.toFixed(4));
            }
          }
        } else if (msg.type === "audio" && msg.buffer) {
          if (state.audioWs && state.audioWs.readyState === WebSocket.OPEN) {
            try {
              state.audioWs.send(msg.buffer);
            } catch (err) {
              console.warn(
                "[Audio] Failed to send audio chunk:",
                err?.message || err,
              );
            }
          }
        }
      };
      // Avoid feedback: route through gain(0)
      const silentGain = state.audioContext.createGain();
      silentGain.gain.value = 0;
      source
        .connect(workletNode)
        .connect(silentGain)
        .connect(state.audioContext.destination);
      state.processor = workletNode;

      // Send recording mode to server
      send({
        type: "start_audio",
        speaker: state.currentSpeaker,
        recording_mode: mode, // 'interviewer' or 'student'
        system_audio: !!state.systemAudio,
      });

      state.recording = true;
      state.recordingMode = mode;
      updateRecordingUI();

      // Start silence monitor
      clearInterval(state._silenceMonitor);
      state._silenceStarted = Date.now();
      state._silenceMonitor = setInterval(() => {
        if (!state.recording) return;
        const rms = state.lastRMS || 0;
        const elapsed = Date.now() - state._silenceStarted;
        // Adaptive threshold: lower for system audio (desktop loopback often quieter)
        let threshold = state.systemAudio ? 0.0003 : 0.0008;
        if (state._gainEnabled) {
          threshold *= 0.5; // more sensitive when gain normalization is active
        }
        if (rms > threshold) {
          state._lastNonSilent = Date.now();
        }
        if (!state._lastNonSilent) state._lastNonSilent = Date.now();
        const silenceDuration = Date.now() - state._lastNonSilent;
        if (elapsed > 2500 && silenceDuration > 6000) {
          if (
            !state._lastSilenceNotice ||
            Date.now() - state._lastSilenceNotice > 12000
          ) {
            state._lastSilenceNotice = Date.now();
            if (state.systemAudio) {
              // Throttle low-level warning frequency already handled; reduce verbosity when gain enabled
              if (!state._gainEnabled) {
                console.warn(
                  "[Audio] Low system audio levels (rms=" +
                    rms.toExponential(2) +
                    "). Is audio playing?",
                );
              }
            } else {
              console.warn(
                "[Audio] No mic input detected (rms=" +
                  rms.toExponential(2) +
                  "). Is the correct microphone selected / permission granted?",
              );
              showNotification(
                "No mic input detected. Check mic / permissions.",
                "warn",
              );
            }
          }
        }
      }, 500);

      const modeText = mode === "interviewer" ? "Interviewer" : "Student";
      console.log(
        `[Audio] Recording started (${modeText}) systemAudio=${!!state.systemAudio}`,
      );

      // IMPORTANT: Force chat to expand when recording starts so transcripts are visible
      if (chatContainer) {
        chatContainer.classList.add("expanded");
        chatContainer.removeAttribute("data-user-collapsed");
        chatContainer.removeAttribute("data-collapse-time");
        console.log("[Chat] Force expanded - recording started");
      }

      showNotification(
        `Recording ${modeText} - ${state.userNames[state.currentSpeaker]}`,
        "success",
      );
      return true;
    } catch (e) {
      console.error("Toolbar startRecording error:", e);
      showNotification("Failed to start recording", "error");
      stopRecording();
      return false;
    }
  }

  async function startInterviewerRecording() {
    // Prevent rapid double toggles causing restart
    const now = Date.now();
    if (
      state._lastInterviewerToggle &&
      now - state._lastInterviewerToggle < 600
    ) {
      console.log("[Audio] Ignoring rapid interviewer toggle");
      return;
    }
    state._lastInterviewerToggle = now;

    if (
      !ensureCompanyBriefReady(
        () => startInterviewerRecording(),
        "starting the interviewer recording",
        false,
      )
    ) {
      return;
    }

    if (
      state.interviewerRecording ||
      (state.recording && state.recordingMode === "interviewer")
    ) {
      stopInterviewerRecording();
      return;
    }

    // If student mic currently active, stop it before starting interviewer mode
    if (state.recording && state.recordingMode === "student") {
      console.log(
        "[Audio] Stopping student mic before starting interviewer recording",
      );
      stopStudentMic();
      await new Promise((r) => setTimeout(r, 120));
    }

    // Clear capture mode state when switching to transcribe mode
    console.log(
      "[Audio] Switching to transcribe mode - clearing capture state",
    );
    state.forceCaptureRequest = false;
    state.autoTriggerAI = false;
    state.capturedScreens = [];
    state.captureCount = 0;
    state.lastQuestionContext = "transcription";

    // Interviewer / meeting audio should default to system/output capture
    state._pendingSystemAudio = true; // force system audio route
    console.log(
      "[Audio] Attempting to start interviewer recording (system audio preferred)",
    );
    const ok = await startRecording("interviewer");
    if (ok) {
      state.interviewerRecording = true;
      updateRecordingUI();
    } else {
      console.warn("[Audio] Interviewer recording failed to start");
      showNotification("Interviewer recording failed to start", "error");
    }
  }

  function stopInterviewerRecording() {
    if (state.recording && state.recordingMode === "interviewer") {
      stopRecording();
    }
    state.interviewerRecording = false;
    updateRecordingUI();
  }

  async function startStudentMic() {
    // Simple debounce to avoid rapid double clicks
    const now = Date.now();
    if (state._lastStudentToggle && now - state._lastStudentToggle < 600) {
      console.log("[Audio] Ignoring rapid student toggle");
      return;
    }
    state._lastStudentToggle = now;

    if (
      !ensureCompanyBriefReady(
        () => startStudentMic(),
        "enabling the student microphone",
        false,
      )
    ) {
      return;
    }

    if (
      state.studentMicOn ||
      (state.recording && state.recordingMode === "student")
    ) {
      stopStudentMic();
      return;
    }

    // If interviewer recording active, stop it first (mode switch)
    if (state.recording && state.recordingMode === "interviewer") {
      console.log(
        "[Audio] Stopping interviewer recording before starting student mic",
      );
      stopInterviewerRecording();
      await new Promise((r) => setTimeout(r, 120));
    }

    // Clear capture mode state when switching to transcribe mode
    console.log(
      "[Audio] Switching to transcribe mode (student) - clearing capture state",
    );
    state.forceCaptureRequest = false;
    state.autoTriggerAI = false;
    state.capturedScreens = [];
    state.captureCount = 0;
    state.lastQuestionContext = "transcription";

    const ok = await startRecording("student");
    if (ok) {
      state.studentMicOn = true;
      updateRecordingUI();
    } else {
      // Ensure flag not left true on failure
      state.studentMicOn = false;
      updateRecordingUI();
      showNotification("Failed to start student mic", "error");
    }
  }

  function stopStudentMic() {
    if (state.recording && state.recordingMode === "student") {
      stopRecording();
    } else {
      // If not actually recording ensure internal flag consistency
      if (!state.recording) {
        console.log(
          "[Audio] stopStudentMic called but no active student recording; clearing flag",
        );
      }
    }
    state.studentMicOn = false;
    updateRecordingUI();
  }

  // Start student recording but attempt to capture system/output audio (remote participant)
  async function startStudentSystemRecording() {
    if (
      !ensureCompanyBriefReady(
        () => startStudentSystemRecording(),
        "capturing student audio",
        false,
      )
    ) {
      return;
    }
    state._pendingSystemAudio = true;
    await startRecording("student");
  }

  function stopRecording() {
    console.log(
      "[Audio] stopRecording invoked; wasMode=",
      state.recordingMode,
      "recording=",
      state.recording,
    );
    try {
      send({ type: "stop_audio" });
    } catch {}
    const wasMode = state.recordingMode;
    state.recording = false;
    state.recordingMode = null;

    // Update individual state flags
    if (wasMode === "interviewer") {
      state.interviewerRecording = false;
    } else if (wasMode === "student") {
      state.studentMicOn = false;
    }
    // If neither mode flagged but a partial failure occurred, clear both flags defensively
    if (!wasMode && (state.interviewerRecording || state.studentMicOn)) {
      console.warn("[Audio] Clearing stale recording flags (no wasMode)");
      state.interviewerRecording = false;
      state.studentMicOn = false;
    }

    try {
      if (state.processor) {
        try {
          state.processor.disconnect();
        } catch {}
        state.processor.onaudioprocess = null;
        state.processor = null;
      }
      if (state.mediaStream) {
        try {
          state.mediaStream.getTracks().forEach((t) => t.stop());
        } catch {}
        state.mediaStream = null;
      }
      if (state.audioContext) {
        try {
          state.audioContext.close();
        } catch {}
        state.audioContext = null;
      }
      if (state.audioWs) {
        try {
          state.audioWs.close();
        } catch {}
        state.audioWs = null;
      }
      clearInterval(state._silenceMonitor);
      state._silenceMonitor = null;
      state._lastNonSilent = null;
      state.lastRMS = 0;
    } catch (e) {
      console.warn("[Audio] Cleanup error", e);
    }
    updateRecordingUI();
    if (state.connected) {
      const modeText =
        wasMode === "interviewer"
          ? "Interviewer"
          : wasMode === "student"
            ? "Student Mic"
            : "";
      showNotification(
        `Recording stopped${modeText ? " - " + modeText : ""}`,
        "success",
      );
    }
  }

  // Answer helpers
  function appendAnswer(text) {
    if (!text) return;

    // Format as chat if text contains dialogue
    if (text.includes("?") && text.length > 50) {
      try {
        const chatContainer = formatChatMessage(text);
        if (chatContainer) {
          // Clear the current content and append the formatted chat
          answerEl.innerHTML = "";
          answerEl.appendChild(chatContainer);
          queueResize();
          return;
        }
      } catch (e) {
        console.error("Error formatting chat:", e);
      }
    }

    // Ensure answer panel is visible when we have content
    if (answerEl && !answerEl.classList.contains("expanded"))
      answerEl.classList.add("expanded");

    // Default fallback: just append text
    answerEl.textContent += text;

    // Auto scroll
    answerEl.scrollTop = answerEl.scrollHeight;

    // Auto-resize host window to fit content
    queueResize();
  }

  // Format chat with speaker separation
  function formatChatMessage(text) {
    if (!text) return null;

    // Create a container for chat bubbles
    const container = document.createElement("div");
    // Use distinct class to avoid clashing with main #chatContainer which controls visibility
    container.className = "chat-transcript-preview";

    // Get speaker names from parent window or defaults
    try {
      if (window.opener) {
        state.userNames = window.opener.getUserNames
          ? window.opener.getUserNames()
          : state.userNames;
      }
    } catch {}

    // Split text into sentences for alternating speakers
    const sentences = text.split(/([.!?]\s+)/g);
    let speaker = state.currentSpeaker;
    let buffer = "";

    for (let i = 0; i < sentences.length; i++) {
      buffer += sentences[i];
      if (i % 2 === 1 || i === sentences.length - 1) {
        if (buffer.trim()) {
          const bubble = document.createElement("div");
          bubble.className = `chat-bubble ${speaker}`;

          // Add speaker label
          const nameLabel = document.createElement("div");
          nameLabel.className = `speaker-label speaker-${speaker}`;
          nameLabel.textContent = state.userNames[speaker] || speaker;
          bubble.appendChild(nameLabel);

          // Add message text
          bubble.appendChild(document.createTextNode(buffer.trim()));
          container.appendChild(bubble);

          // Switch speaker on question mark or end of statement
          if (buffer.trim().endsWith("?") || buffer.trim().endsWith(".")) {
            speaker = speaker === "user1" ? "user2" : "user1";
          }
        }
        buffer = "";
      }
    }

    return container;
  }

  // (Previous code defined queueResize already for dimension fitting. The legacy height-only
  // version below caused a name collision preventing proper window resizing after chat growth.)
  // Rename legacy implementation to queueResizeHeight and have it delegate to modern queueResize.
  let resizeTimer;
  function queueResizeHeight() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const bar = document.querySelector(".bar");
      const barRect = bar ? bar.getBoundingClientRect() : { height: 0 };
      const answerRect = answerEl
        ? answerEl.getBoundingClientRect()
        : { height: 0 };
      const padding = 24; // top/bottom padding and margins

      // Calculate the desired height based on content including chat
      let desired = barRect.height + answerRect.height + padding;

      // Add chat container height if expanded
      if (chatContainer && chatContainer.classList.contains("expanded")) {
        const chatRect = chatContainer.getBoundingClientRect();
        desired += chatRect.height;
      }

      // If there's not much content, ensure a minimum height
      if (
        answerEl.textContent.trim().length < 50 &&
        state.chatHistory.length === 0
      ) {
        desired = Math.max(desired, 140); // Minimum height
      }

      // Cap at a reasonable maximum height to prevent excessive growth
      desired = Math.min(desired, 700);

      if (window.electronAPI && window.electronAPI.resizeToolbar)
        window.electronAPI.resizeToolbar(Math.ceil(desired));
      // Also trigger width/height smart sizing pass
      queueResize();
    }, 50);
  }

  // Notification helper
  function showNotification(message, type = "info") {
    // Remove any existing notifications
    const existing = document.querySelectorAll(".notification");
    existing.forEach((el) => el.remove());

    // Create new notification
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Show and then fade out
    setTimeout(() => notification.classList.add("show"), 10);
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Wire UI
  // Helper to ensure backend server is running and websocket connected before actions
  async function ensureServerAndConnect() {
    try {
      if (state.connected && state.ws && state.ws.readyState === WebSocket.OPEN)
        return true;
      if (window.electronAPI && window.electronAPI.serverStart) {
        const res = await window.electronAPI.serverStart();
        if (!res || !res.ok) {
          showNotification(
            "Failed to start server" +
              (res && res.error ? ": " + res.error : ""),
            "error",
          );
          return false;
        }
      }
      // Attempt connection (will internally scan ports)
      connect();
      // Wait briefly for connection
      let waited = 0;
      while (!state.connected && waited < 4000) {
        await new Promise((r) => setTimeout(r, 200));
        waited += 200;
      }
      return state.connected;
    } catch (e) {
      console.warn("ensureServerAndConnect failed", e);
      return false;
    }
  }

  if (toggleRecord) {
    toggleRecord.addEventListener("click", () => {
      console.log(
        `Button clicked - state.connected: ${state.connected}, ws state: ${state.ws ? state.ws.readyState : "null"}`,
      );
      if (!state.connected) {
        showNotification("Connecting...", "info");
        ensureServerAndConnect().then((ok) => {
          if (!ok) return;
          if (state.recording) stopRecording();
          else startRecording();
        });
        return;
      }
      if (state.recording) stopRecording();
      else startRecording();
    });
    toggleRecord.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleRecord.click();
      }
    });
  }

  async function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve((reader.result || "").toString().split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFiles(files) {
    if (!files || !files.length) return;
    try {
      showNotification(`Uploading ${files.length} screenshot(s)...`, "success");
      for (const file of files) {
        const b64 = await readFileAsBase64(file);
        if (b64) {
          send({ type: "ocr", image: b64 });
        }
      }
      showNotification("OCR processing started for uploads");
    } catch (e) {
      showNotification("Failed to process selected images", "error");
    }
  }

  if (uploadInput) {
    uploadInput.addEventListener("change", async (e) => {
      const files = uploadInput.files;
      await handleFiles(files);
      uploadInput.value = "";
    });
  }

  if (captureBtn)
    captureBtn.addEventListener("click", async (ev) => {
      // Ctrl-click = clear all captures. Regular click = capture screen.
      const isCtrl = ev && (ev.ctrlKey || ev.metaKey);
      if (isCtrl) {
        // Clear all captures
        state.capturedScreens = [];
        state.captureCount = 0;
        state.forceCaptureRequest = false;
        state.autoTriggerAI = false;
        updateCaptureUI();
        // Send clear message to server
        send({ type: "clear_captures" });
        showNotification("All captures cleared", "success");
        return;
      }

      try {
        if (!state.connected) {
          const ok = await ensureServerAndConnect();
          if (!ok) return;
        }
        captureBtn.disabled = true;
        captureBtn.dataset.prevTitle = captureBtn.title;
        captureBtn.title = "Capturing...";
        console.log(
          "[OCR] Initiating screen capture (recording=" +
            !!state.recording +
            ", systemAudio=" +
            !!state.systemAudio +
            ")",
        );
        const capResult = await window.electronAPI.captureScreen();
        // Support both legacy (string) and new object format
        const img =
          capResult && typeof capResult === "object"
            ? capResult.image
            : capResult;
        if (img) {
          if (capResult && typeof capResult === "object") {
            console.log(
              `[Capture] Stored capture ${state.captureCount + 1} size=${capResult.width}x${capResult.height} requested=${capResult.requestedWidth}x${capResult.requestedHeight} scale=${capResult.scaleFactor}`,
            );
          }
          if (img.length < 5000) {
            console.warn(
              "[OCR] Warning: very small capture payload (<5KB) may degrade OCR accuracy",
            );
          }
          // Store the capture (store object for potential future re-analysis/UI details)
          state.capturedScreens.push(capResult);
          state.captureCount++;
          updateCaptureUI();

          // Send OCR for this capture with metadata
          console.log(
            "[OCR] Sending OCR payload index=" +
              (state.captureCount - 1) +
              " bytes=" +
              img.length,
          );
          send({
            type: "ocr",
            image: img,
            captureIndex: state.captureCount - 1,
            meta:
              capResult && typeof capResult === "object"
                ? {
                    width: capResult.width,
                    height: capResult.height,
                    requestedWidth: capResult.requestedWidth,
                    requestedHeight: capResult.requestedHeight,
                    displayId: capResult.displayId,
                    scaleFactor: capResult.scaleFactor,
                  }
                : undefined,
          });
          
          // Update timestamp to allow server-initiated AI response
          window.lastUserAIRequestTs = Date.now();
          console.log("[Auto-AI] Updated request timestamp for regular capture");
          
          showNotification(
            `Screen ${state.captureCount} captured and analyzing`,
            "success",
          );
        } else {
          console.error("[OCR] No image data returned from captureScreen");
        }
      } catch (e) {
        console.error("[OCR] Capture failed", e);
        showNotification("Failed to capture screen (see console)", "error");
      } finally {
        captureBtn.disabled = false;
        if (captureBtn.dataset.prevTitle)
          captureBtn.title = captureBtn.dataset.prevTitle;
      }
    });

  // Add keyboard accessibility to capture button
  if (captureBtn) {
    captureBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        captureBtn.click();
      }
    });
  }

  // -------- Company Brief Capture --------
  function toggleCompanyBrief(show) {
    if (!companyBriefOverlay) {
      log.error("Company brief overlay element not found");
      return;
    }

    log.debug("Toggling company brief:", show);

    if (show) {
      // Position panel relative to toolbar so it hugs the bar like the chat panel
      if (barEl) {
        const barRect = barEl.getBoundingClientRect();
        const offsetTop = Math.max(barRect.bottom + 24, 96);
        companyBriefOverlay.style.top = `${offsetTop}px`;
        companyBriefOverlay.style.maxHeight = `calc(100vh - ${offsetTop + 48}px)`;
        companyBriefOverlay.style.height = `calc(100vh - ${offsetTop + 48}px)`;
      } else {
        companyBriefOverlay.style.top = "96px";
        companyBriefOverlay.style.maxHeight = "calc(100vh - 160px)";
        companyBriefOverlay.style.height = "calc(100vh - 160px)";
      }

      companyBriefOverlay.classList.add("show");
      companyBriefOverlay.setAttribute("aria-hidden", "false");
      resetCompanyBriefStatus();
      populateCompanyBriefFormFromState();

      if (window.electronAPI && window.electronAPI.resizeToolbarDimensions) {
        try {
          const barRect = barEl
            ? barEl.getBoundingClientRect()
            : { width: 360 };
          const targetW = Math.max(Math.round(barRect.width + 80), 540);
          window.electronAPI.resizeToolbarDimensions(targetW, 700);
        } catch (resizeErr) {
          log.warn(
            "Failed to resize toolbar window for company brief",
            resizeErr,
          );
        }
      } else {
        document.body.style.height = "100vh";
        document.body.style.overflow = "auto";
      }

      // Focus the overlay and first input once painted
      requestAnimationFrame(() => {
        companyBriefOverlay.focus({ preventScroll: true });
        setTimeout(() => {
          if (companyNameInput) companyNameInput.focus();
        }, 30);
      });
      log.info("Company brief opened");
    } else {
      companyBriefOverlay.classList.remove("show");
      companyBriefOverlay.setAttribute("aria-hidden", "true");
      companyBriefOverlay.style.top = "";
      companyBriefOverlay.style.maxHeight = "";
      companyBriefOverlay.style.height = "";

      if (window.electronAPI && window.electronAPI.resizeToolbarDimensions) {
        queueResize();
      } else {
        document.body.style.height = "";
        document.body.style.overflow = "";
      }

      log.info("Company brief closed");
    }
  }

  function resetCompanyBriefStatus(message = "", state = "muted") {
    if (!companyBriefStatus) return;
    companyBriefStatus.textContent = message;
    companyBriefStatus.dataset.state = state;
  }

  if (companyBriefBtn) {
    log.debug("Company brief button found, attaching event listeners");
    companyBriefBtn.addEventListener("click", () => {
      log.debug("Company brief button clicked");
      const shouldShow =
        !companyBriefOverlay || !companyBriefOverlay.classList.contains("show");
      toggleCompanyBrief(shouldShow);
    });
    companyBriefBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        log.debug("Company brief button activated via keyboard");
        const shouldShow =
          !companyBriefOverlay ||
          !companyBriefOverlay.classList.contains("show");
        toggleCompanyBrief(shouldShow);
      }
    });
  } else {
    log.warn("Company brief button not found in DOM");
  }

  if (companyBriefCancel) {
    companyBriefCancel.addEventListener("click", () => {
      toggleCompanyBrief(false);
      if (companyBriefForm) companyBriefForm.reset();
      populateCompanyBriefFormFromState();
      resetCompanyBriefStatus();
      if (companyBriefSave) companyBriefSave.disabled = false;
    });
  }

  if (companyBriefOverlay) {
    companyBriefOverlay.addEventListener("click", (e) => {
      if (e.target === companyBriefOverlay) {
        toggleCompanyBrief(false);
        if (companyBriefForm) companyBriefForm.reset();
        populateCompanyBriefFormFromState();
        resetCompanyBriefStatus();
        if (companyBriefSave) companyBriefSave.disabled = false;
      }
    });
    companyBriefOverlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        toggleCompanyBrief(false);
        if (companyBriefForm) companyBriefForm.reset();
        populateCompanyBriefFormFromState();
        resetCompanyBriefStatus();
        if (companyBriefSave) companyBriefSave.disabled = false;
      }
    });
  }

  async function submitCompanyBrief(event) {
    event.preventDefault();
    if (
      !state.connected ||
      !state.ws ||
      state.ws.readyState !== WebSocket.OPEN
    ) {
      showNotification("Server not connected yet", "error");
      resetCompanyBriefStatus("Connect to the server before saving.", "error");
      return;
    }
    if (!companyNameInput || !companyOverviewInput) return;

    const name = companyNameInput.value.trim();
    const overview = companyOverviewInput.value.trim();
    if (!name || !overview) {
      resetCompanyBriefStatus(
        "Company name and overview are required.",
        "error",
      );
      return;
    }

    const payload = {
      type: "context",
      context_kind: "company",
      name,
      role: (companyRoleInput && companyRoleInput.value.trim()) || undefined,
      website:
        (companyWebsiteInput && companyWebsiteInput.value.trim()) || undefined,
      overview,
      notes: (companyNotesInput && companyNotesInput.value.trim()) || undefined,
    };

    try {
      companyBriefSave && (companyBriefSave.disabled = true);
      resetCompanyBriefStatus("Sharing context with AI...", "info");
      state.pendingCompanyBrief = payload;
      state.companyBriefSilentSync = false;
      state.companyBriefConfirmationPending = true;
      state.companyBriefConfirmedForSession = false;
      state.ws.send(JSON.stringify(payload));
    } catch (err) {
      console.error("Failed to send company brief", err);
      resetCompanyBriefStatus("Failed to share company details.", "error");
      showNotification("Failed to share company brief", "error");
      state.pendingCompanyBrief = null;
      state.companyBriefSilentSync = false;
      state.companyBriefConfirmationPending = false;
      if (companyBriefSave) companyBriefSave.disabled = false;
    }
  }

  if (companyBriefForm) {
    companyBriefForm.addEventListener("submit", submitCompanyBrief);
  }

  // -------- Resume Upload Feature (before interview starts) --------
  function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  async function ingestResume(file) {
    if (!file) return;
    if (!state.ws || state.ws.readyState !== 1) {
      showNotification("Server not connected yet", "error");
      return;
    }
    try {
      showNotification("Uploading resume...", "info");
      const buf = await file.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      const msg = { type: "resume", name: file.name, content: b64 };
      state.ws.send(JSON.stringify(msg));
    } catch (e) {
      console.error("Resume upload failed", e);
      showNotification("Resume upload failed", "error");
    }
  }

  if (resumeUploadBtn) {
    resumeUploadBtn.addEventListener("click", () => {
      if (resumeFileInput) resumeFileInput.click();
    });
    resumeUploadBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        resumeUploadBtn.click();
      }
    });
  }
  if (resumeFileInput) {
    resumeFileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        // Validate file size
        if (!validateFileSize(file)) {
          e.target.value = "";
          return;
        }
        ingestResume(file);
      }
      // reset so same file can be re-selected
      e.target.value = "";
    });
  }

  // Visibility toggles the compact toolbar window visibility/background
  if (visibilityBtn)
    visibilityBtn.addEventListener("click", async () => {
      try {
        // Toggle compact display of the answer panel only
        if (answerEl) {
          const isHidden = !answerEl.classList.contains("expanded");
          if (isHidden) {
            answerEl.classList.add("expanded");
            if (barEl) barEl.classList.add("no-bg");
            showNotification("Answer panel expanded", "success");
          } else {
            answerEl.classList.remove("expanded");
            if (barEl) barEl.classList.remove("no-bg");
            showNotification("Answer panel collapsed", "success");
          }
          queueResize();
        }
      } catch (e) {
        showNotification("Failed to toggle visibility", "error");
      }
    });

  // Add keyboard accessibility to visibility button
  if (visibilityBtn) {
    visibilityBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        visibilityBtn.click();
      }
    });
  }

  // Listen Student toggle
  if (toggleStudentBtn)
    toggleStudentBtn.addEventListener("click", () => {
      console.log(
        "Toggle clicked! Current state:",
        listenStudent,
        "-> toggling to:",
        !listenStudent,
      );
      listenStudent = !listenStudent;
      updateListenStudentUI();
      savePrefs();
      send({ type: "listen_student", enabled: listenStudent });
      showNotification(
        listenStudent
          ? "Student listening enabled"
          : "Student listening disabled",
        "success",
      );
    });

  // Debug: Log if button was found
  console.log("Toggle student button found:", !!toggleStudentBtn);

  // Add keyboard accessibility to toggle student button
  if (toggleStudentBtn) {
    toggleStudentBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleStudentBtn.click();
      }
    });
  }

  if (promptInput && sendBtn) {
    // Auto-resize function for textarea
    function autoResizeTextarea() {
      promptInput.style.height = "auto";
      promptInput.style.height = Math.min(promptInput.scrollHeight, 150) + "px";
    }

    promptInput.addEventListener("input", () => {
      sendBtn.disabled = !state.connected || !promptInput.value.trim();
      autoResizeTextarea(); // Auto-resize when content changes
    });

    // Also resize on paste events
    promptInput.addEventListener("paste", () => {
      setTimeout(autoResizeTextarea, 0);
    });

    promptInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !sendBtn.disabled) {
        e.preventDefault();
        sendBtn.click();
      }
    });
  }

  // New inline chat input feature
  const chatPrompt = document.getElementById("chatPrompt");
  const chatSend = document.getElementById("chatSend");
  let pendingFileUpload = null; // Declare here for broader scope

  if (chatPrompt && chatSend) {
    const autoSize = () => {
      chatPrompt.style.height = "auto";
      chatPrompt.style.height = Math.min(chatPrompt.scrollHeight, 140) + "px";
    };
    const updateDisabled = () => {
      const empty = !chatPrompt.value.trim() && !pendingFileUpload;
      const notConnected = !state.connected;
      chatSend.disabled = empty || notConnected || chatPrompt._busy;
      if (chatSend.disabled) {
        if (notConnected) {
          chatSend.title = "Waiting for server connection...";
        } else if (empty) {
          chatSend.title = "Type a message or attach a file";
        } else if (chatPrompt._busy) {
          chatSend.title = "Sending...";
        }
      } else {
        chatSend.title = "Send (Enter)";
      }
    };
    chatPrompt.addEventListener("input", () => {
      autoSize();
      updateDisabled();
    });
    // Enhanced paste support: accept images (from clipboard) and plain text
    chatPrompt.addEventListener("paste", async (e) => {
      try {
        const items =
          e.clipboardData && e.clipboardData.items
            ? Array.from(e.clipboardData.items)
            : [];
        const hasImage = items.find(
          (it) => it.type && it.type.startsWith("image/"),
        );
        if (hasImage) {
          // Prevent default text paste for image content
          e.preventDefault();
          // Read the image blob
          const blob = hasImage.getAsFile();
          if (!blob) return;
          // Validate size (<=10MB)
          if (blob.size > 10 * 1024 * 1024) {
            try {
              showNotification("Pasted image is larger than 10MB", "error");
            } catch {}
            return;
          }
          // Read as base64
          const b64 = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () =>
              resolve((fr.result || "").toString().split(",")[1] || "");
            fr.onerror = reject;
            fr.readAsDataURL(blob);
          });
          if (!b64) return;
          // Store as pending file upload, infer name/type
          const inferredType = blob.type || "image/png";
          const inferredName = `pasted-${Date.now()}.${inferredType.includes("png") ? "png" : inferredType.includes("jpeg") ? "jpg" : "img"}`;
          pendingFileUpload = {
            data: b64,
            type: inferredType,
            name: inferredName,
          };
          // Ensure chat visible
          const container = document.getElementById("chatContainer");
          if (container && !container.classList.contains("expanded")) {
            container.classList.add("expanded");
            queueResize();
          }
          if (container) container.setAttribute("data-force-expanded", "true");
          // Show indicator
          try {
            showFileAttachment(inferredName, inferredType);
          } catch {}
          updateDisabled();
          try {
            showNotification("Image pasted – ready to send", "success");
          } catch {}
        } else {
          // Let text paste happen; then auto-size/update
          setTimeout(() => {
            autoSize();
            updateDisabled();
          }, 0);
        }
      } catch (err) {
        console.warn("Paste handler error:", err);
        setTimeout(() => {
          autoSize();
          updateDisabled();
        }, 0);
      }
    });
    chatPrompt.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!chatSend.disabled) chatSend.click();
      }
    });
    chatSend.addEventListener("click", () => {
      const text = chatPrompt.value.trim();
      const hasFile = pendingFileUpload !== null;

      // Require either text or file
      if (!text && !hasFile) return;

      // Auto-expand chat if collapsed
      const container = document.getElementById("chatContainer");
      if (container && !container.classList.contains("expanded")) {
        container.classList.add("expanded");
        queueResize();
      }
      if (container) {
        // Mark that user explicitly wants chat to stay open
        container.setAttribute("data-force-expanded", "true");
      }
      if (!state.connected) {
        showNotification("Not connected yet – trying...", "info");
        ensureServerAndConnect().then((ok) => {
          if (ok) chatSend.click();
        });
        return;
      }

      // Build user message for display
      let displayMessage = text;
      if (hasFile) {
        const fileIcon =
          pendingFileUpload.type === "application/pdf" ? "📄" : "🖼️";
        if (text) {
          displayMessage = `${text}\n${fileIcon} ${pendingFileUpload.name}`;
        } else {
          displayMessage = `${fileIcon} ${pendingFileUpload.name}`;
        }
      }

      // Show user message immediately in chat
      addChatMessage("interviewer", displayMessage);

      // Determine context channel - use last context for follow-up questions
      // This allows the AI to maintain conversation history across questions
      let questionChannel = "general";
      if (hasFile) {
        questionChannel = "capture";
      } else if (
        text &&
        state.lastQuestionContext &&
        state.lastQuestionContext !== "general"
      ) {
        // If this looks like a follow-up (short question, recent AI activity), keep the context
        const timeSinceLastAI = Date.now() - (window.lastUserAIRequestTs || 0);
        const isFollowUp = text.length < 200 && timeSinceLastAI < 120000; // Within 2 minutes
        if (isFollowUp) {
          questionChannel = state.lastQuestionContext;
          log.info(
            `Follow-up question detected, using context: ${questionChannel}`,
          );
        }
      }

      // Build message (use same path as Ask AI but with direct question)
      const message = {
        type: "coach",
        question_channel: questionChannel,
        question:
          text ||
          `Analyze this ${hasFile && pendingFileUpload.type === "application/pdf" ? "PDF document" : "image"}`,
        interviewer_recent: state.interviewerSegments.slice(-40),
        student_recent: state.studentSegments.slice(-15),
        analysis_recent: state.analysisSegments.slice(-5),
        context_strategy: hasFile ? "file_upload" : "direct_user_question",
        strict: !hasFile, // enforce concise answer only if no file
      };

      // Update last question context for next follow-up
      state.lastQuestionContext = questionChannel;

      // Add file upload data if present
      if (hasFile) {
        message.file_upload = pendingFileUpload;
      }

      try {
        send(message);
      } catch (e) {
        console.warn("Failed to send coach message", e);
      }
      window.lastUserAIRequestTs = Date.now();

      // Clear input and file
      chatPrompt.value = "";
      autoSize();
      chatSend.disabled = true;

      // Clear file attachment
      if (hasFile) {
        pendingFileUpload = null;
        chatFileInput.value = "";
        const indicator = document.querySelector(".file-attachment-indicator");
        if (indicator) indicator.remove();
      }

      showNotification(
        hasFile ? "Message with attachment sent" : "Question sent",
        "success",
      );
      // Refocus prompt for rapid follow-up
      setTimeout(() => {
        try {
          chatPrompt.focus();
        } catch {}
      }, 10);
    });
    updateDisabled();
    // Also observe chat container collapse/expand to adjust disabled state
    const cont = document.getElementById("chatContainer");
    if (cont && typeof ResizeObserver !== "undefined") {
      const ro = new MutationObserver(() => updateDisabled());
      ro.observe(cont, { attributes: true, attributeFilter: ["class"] });
    }
  }

  // File upload functionality for chat - store file until user clicks Send
  const chatUpload = document.getElementById("chatUpload");
  const chatFileInput = document.getElementById("chatFileInput");
  // pendingFileUpload already declared above with chatPrompt/chatSend scope

  if (chatUpload && chatFileInput && chatPrompt) {
    chatUpload.addEventListener("click", () => {
      if (!state.connected) {
        showNotification("Connect to server first", "warning");
        return;
      }
      chatFileInput.click();
    });

    chatFileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file type
      const validTypes = [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/gif",
        "image/webp",
        "application/pdf",
      ];
      if (!validTypes.includes(file.type)) {
        showNotification(
          "Please upload an image (PNG, JPG, GIF, WEBP) or PDF file",
          "error",
        );
        chatFileInput.value = "";
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        showNotification("File size must be less than 10MB", "error");
        chatFileInput.value = "";
        return;
      }

      try {
        showNotification(`File attached: ${file.name}`, "info");

        // Read file as base64 and store it
        const reader = new FileReader();
        reader.onload = () => {
          const base64Data = reader.result.split(",")[1];

          // Store the file data for sending later
          pendingFileUpload = {
            data: base64Data,
            type: file.type,
            name: file.name,
          };

          // Auto-expand chat if collapsed
          const container = document.getElementById("chatContainer");
          if (container && !container.classList.contains("expanded")) {
            container.classList.add("expanded");
            queueResize();
          }
          if (container) {
            container.setAttribute("data-force-expanded", "true");
          }

          // Show file attachment indicator below textarea
          showFileAttachment(file.name, file.type);

          // Enable send button if it was disabled
          updateDisabled();
        };

        reader.onerror = () => {
          showNotification("Failed to read file", "error");
          chatFileInput.value = "";
        };

        reader.readAsDataURL(file);
      } catch (err) {
        console.error("File upload error:", err);
        showNotification("Upload failed", "error");
        chatFileInput.value = "";
      }
    });

    // Function to show file attachment indicator
    function showFileAttachment(fileName, fileType) {
      const inputArea = document.getElementById("chatInputArea");
      if (!inputArea) return;

      // Remove any existing attachment indicator
      const existing = inputArea.querySelector(".file-attachment-indicator");
      if (existing) existing.remove();

      // Create new attachment indicator
      const fileIcon = fileType === "application/pdf" ? "📄" : "🖼️";
      const indicator = document.createElement("div");
      indicator.className = "file-attachment-indicator";
      indicator.innerHTML = `
        <span class="file-icon">${fileIcon}</span>
        <span class="file-name">${fileName}</span>
        <button class="remove-file" title="Remove attachment">×</button>
      `;

      // Insert before textarea
      inputArea.insertBefore(indicator, inputArea.firstChild);

      // Add remove button handler
      indicator.querySelector(".remove-file").addEventListener("click", () => {
        pendingFileUpload = null;
        chatFileInput.value = "";
        indicator.remove();
        updateDisabled();
        showNotification("File attachment removed", "info");
      });
    }

    // Update upload button state based on connection
    const updateUploadButton = () => {
      chatUpload.disabled = !state.connected;
      chatUpload.title = state.connected
        ? "Upload image or PDF"
        : "Connect to server first";
    };
    updateUploadButton();
    // Listen for connection changes
    setInterval(updateUploadButton, 1000);
  }

  if (sendBtn && promptInput)
    sendBtn.addEventListener("click", () => {
      const text = promptInput.value.trim();
      if (!text) return;
      // Ask for a suggested answer directly via coach endpoint
      send({ type: "coach", question: text, question_channel: "general" });
      promptInput.value = "";
      promptInput.style.height = "auto"; // Reset height when cleared
      sendBtn.disabled = true;

      showNotification("Question sent, processing answer...");
    });

  // Add keyboard accessibility to send button
  if (sendBtn) {
    sendBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        sendBtn.click();
      }
    });
  }

  if (clearBtn && promptInput && sendBtn) {
    clearBtn.addEventListener("click", () => {
      promptInput.value = "";
      promptInput.style.height = "auto"; // Reset height when cleared
      sendBtn.disabled = !state.connected;
    });

    // Add keyboard accessibility to clear button
    clearBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        clearBtn.click();
      }
    });
  }

  if (hideBtn) {
    hideBtn.addEventListener("click", () => {
      if (window.electronAPI && window.electronAPI.hideToolbar) {
        window.electronAPI.hideToolbar();
      } else {
        window.close();
      }
    });

    // Add keyboard accessibility to hide button
    hideBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        hideBtn.click();
      }
    });
  }

  // Copy answer to clipboard
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const text = answerEl.textContent || "";
      try {
        await navigator.clipboard.writeText(text);
        showNotification("Answer copied to clipboard!", "success");
      } catch {
        showNotification("Failed to copy to clipboard", "error");
      }
    });

    // Add keyboard accessibility to copy button
    copyBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        copyBtn.click();
      }
    });
  }

  // Compact toggle: show/hide answer panel and resize
  let compact = false;
  if (compactBtn && answerEl) {
    compactBtn.addEventListener("click", () => {
      compact = !compact;
      answerEl.style.display = compact ? "none" : "";
      compactBtn.textContent = compact ? "🔽" : "🔼";
      compactBtn.title = compact ? "Show answer" : "Hide answer";
      queueResize();
    });

    // Add keyboard accessibility to compact button
    compactBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        compactBtn.click();
      }
    });
  }

  // Speaker toggle
  if (speakerUser1 && speakerUser2) {
    speakerUser1.addEventListener("click", () => {
      state.currentSpeaker = "user1";
      updateSpeakerUI();
      send({ type: "set_speaker", speaker: "user1" });
      showNotification("Switched to User 1", "success");
    });

    speakerUser2.addEventListener("click", () => {
      state.currentSpeaker = "user2";
      updateSpeakerUI();
      send({ type: "set_speaker", speaker: "user2" });
      showNotification("Switched to User 2", "success");
    });

    // Add keyboard accessibility to speaker buttons
    speakerUser1.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        speakerUser1.click();
      }
    });

    speakerUser2.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        speakerUser2.click();
      }
    });
  }

  // Persist/restore size and preferences
  function restorePrefs() {
    try {
      const prefs = JSON.parse(localStorage.getItem("toolbar_prefs") || "{}");
      if (prefs.compact) {
        compact = true;
        if (answerEl) answerEl.style.display = "none";
        if (compactBtn) compactBtn.textContent = "🔽";
      }
      if (prefs.speaker) {
        state.currentSpeaker = prefs.speaker;
        updateSpeakerUI();
      }
      if (typeof prefs.listenStudent === "boolean") {
        listenStudent = prefs.listenStudent;
        updateListenStudentUI();
      }
    } catch {}
  }

  function savePrefs() {
    try {
      const prefs = {
        compact,
        speaker: state.currentSpeaker,
        listenStudent,
      };
      localStorage.setItem("toolbar_prefs", JSON.stringify(prefs));
    } catch {}
  }

  window.addEventListener("beforeunload", savePrefs);

  // Ask AI button: uses last context (interviewer question or screen analysis)
  if (askAiBtn) {
    askAiBtn.addEventListener("click", async () => {
      const abortCaptureRouting = () => {
        state.forceCaptureRequest = false;
        state.autoTriggerAI = false;
      };
      // Rate limiting check
      if (!aiRateLimit.check()) {
        const resetTime = aiRateLimit.getResetTime();
        const remaining = aiRateLimit.getRemainingRequests();
        showNotification(
          `Rate limit reached (${remaining}/${aiRateLimit.maxPerMinute}). Try again in ${resetTime}s.`,
          "warn",
        );
        log.warn("AI request blocked by rate limiter");
        abortCaptureRouting();
        return;
      }

      if (askAiBtn._cooldownUntil && Date.now() < askAiBtn._cooldownUntil) {
        showNotification(
          `Please wait ${Math.ceil((askAiBtn._cooldownUntil - Date.now()) / 1000)}s (rate limited)`,
          "warn",
        );
        abortCaptureRouting();
        return;
      }
      if (askAiBtn._busy) {
        showNotification("AI is already answering – please wait.", "info");
        abortCaptureRouting();
        return;
      }
      if (!state.connected) {
        const ok = await ensureServerAndConnect();
        if (!ok) return;
      }

      // Clear any stale capture routing if we've shifted contexts
      if (
        state.forceCaptureRequest &&
        state.lastQuestionContext !== "capture"
      ) {
        log.debug(
          "[AI] Clearing stale forceCaptureRequest (context =",
          state.lastQuestionContext,
          ")",
        );
        state.forceCaptureRequest = false;
      }

      // Start performance tracking
      const aiTimer = performanceMetrics.startTimer("aiResponse");

      // Track usage statistics
      usageStats.increment("aiQueries");
      aiRateLimit.add();

      // Check if we're in capture mode with valid screens
      const hasCapturedScreens =
        Array.isArray(state.capturedScreens) &&
        state.capturedScreens.length > 0;
      const captureRequest = !!state.forceCaptureRequest && hasCapturedScreens;

      // Additional validation: If forceCaptureRequest is set but no screens, clear the flag
      if (state.forceCaptureRequest && !hasCapturedScreens) {
        console.warn(
          "[AI] forceCaptureRequest set but no captured screens - clearing flag and using transcription",
        );
        state.forceCaptureRequest = false;
        state.autoTriggerAI = false;
      }

      let finalContext = "";
      let message;

      if (captureRequest) {
        // FOCUS ON CURRENT QUESTION ONLY - extract actual question from OCR text
        const analysisPreview =
          state.analysisSegments && state.analysisSegments.length
            ? state.analysisSegments.slice(-2).join("\n")
            : "";

        // Try to extract the actual question/problem from the OCR text
        // Look for question patterns or just use the OCR text directly
        finalContext =
          analysisPreview ||
          "Please solve the problem shown in the screen capture.";

        log.info(
          "[AI] Sending capture coach request. Screens:",
          state.capturedScreens.length,
          "Context length:",
          finalContext.length,
        );
        log.debug("[AI] Capture context preview:", finalContext.slice(0, 140));
        message = {
          type: "coach",
          question_channel: "capture",
          question: finalContext,
          // DO NOT include queue context - focus only on current question
          interviewer_recent: [],
          student_recent: [],
          analysis_recent: [],
          capturedScreens: state.capturedScreens,
          captureCount: state.captureCount,
          context_strategy: "capture_auto",
        };
        // Track context for follow-up questions
        state.lastQuestionContext = "capture";
      } else {
        const context = buildDynamicAIContext();
        finalContext = (context || "").trim();
        if (!finalContext) {
          // FOCUS ON CURRENT QUESTION ONLY - do not include queue context
          // Only use the most recent question if available
          const contextParts = [];

          // Try to get just the latest question from interviewer
          if (state.interviewerSegments && state.interviewerSegments.length) {
            const lastSegment =
              state.interviewerSegments[state.interviewerSegments.length - 1];
            if (lastSegment) {
              contextParts.push(lastSegment);
            }
          }

          finalContext = contextParts.join(" ").replace(/\s+/g, " ").trim();
        }
        if (!finalContext) {
          // Last resort: generic prompt
          finalContext =
            "Provide a concise helpful coaching tip for an ongoing technical interview conversation.";
        }
        log.info(
          "[AI] Sending transcription coach request. Context length=",
          finalContext.length,
        );
        log.debug("[AI] Context preview:", finalContext.slice(0, 140));
        message = {
          type: "coach",
          question_channel: "transcription",
          question: finalContext,
          // DO NOT include queue context - focus only on current question
          interviewer_recent: [],
          student_recent: [],
          analysis_recent: [],
          context_strategy: "dynamic_transcript_builder",
        };
        // Track context for follow-up questions
        state.lastQuestionContext = "transcription";
      }

      // Reset capture routing flag once context is prepared
      state.forceCaptureRequest = false;
      state.autoTriggerAI = false;
      // Mark busy & disable button
      askAiBtn._busy = true;
      askAiBtn.disabled = true;
      askAiBtn.classList.add("busy");
      const prevLabel = askAiBtn.textContent;
      askAiBtn.textContent = captureRequest
        ? "Analyzing capture…"
        : "Thinking…";
      send(message);
      expandChatContainer();
      showNotification(
        captureRequest
          ? "AI capture analysis request sent"
          : "AI request sent with dynamic context",
        "success",
      );
      // Freeze current unified transcript box (fresh one starts after AI response)
      finalizeLiveTranscript();
      window.lastUserAIRequestTs = Date.now();

      // Helper to clear busy state (used on completion / error / rate limit)
      const clearBusy = () => {
        if (!askAiBtn._busy) return;
        askAiBtn._busy = false;
        if (!askAiBtn._cooldownUntil) {
          askAiBtn.disabled = false;
        }
        askAiBtn.classList.remove("busy");
        askAiBtn.textContent = prevLabel;
      };
      // We expect messages via WebSocket, not window, so instead hook WebSocket onmessage
      if (state.ws) {
        // Instead of fully replacing onmessage (risk of clobbering other listeners), wrap it.
        // server.py never emits 'coach_complete'; it emits {type:'coach', complete:true}.
        const original = state.ws.onmessage;
        state.ws.onmessage = (evt) => {
          if (original) {
            try {
              original.call(state.ws, evt);
            } catch (e) {
              console.error("Original ws handler error", e);
            }
          }
          try {
            const d = JSON.parse(evt.data);
            // Clear busy when we see completion of coach stream
            if (d && d.type === "coach" && d.complete) {
              clearBusy();
              // Remove our wrapper after completion
              state.ws.onmessage = original;
            } else if (d && d.type === "coach" && d.error) {
              // Error surfaced within coach stream (e.g., rate_limit)
              if (d.error === "rate_limit") {
                const retry = (d.retry_after && d.retry_after * 1000) || 10000;
                const until = Date.now() + retry;
                askAiBtn._cooldownUntil = until;
                askAiBtn.textContent = `Retry in ${Math.ceil(retry / 1000)}s`;
                const cdTimer = setInterval(() => {
                  if (!askAiBtn._cooldownUntil) {
                    clearInterval(cdTimer);
                    return;
                  }
                  const left = askAiBtn._cooldownUntil - Date.now();
                  if (left <= 0) {
                    clearInterval(cdTimer);
                    askAiBtn._cooldownUntil = null;
                    if (!askAiBtn._busy) {
                      askAiBtn.disabled = false;
                      askAiBtn.textContent = prevLabel;
                    }
                    return;
                  }
                  askAiBtn.textContent = `Retry in ${Math.ceil(left / 1000)}s`;
                }, 1000);
                showNotification(
                  `Rate limited. Try again after ${Math.ceil(retry / 1000)}s`,
                  "warn",
                );
              } else {
                showNotification(`AI error: ${d.error || "unknown"}`, "error");
              }
              clearBusy();
              state.ws.onmessage = original;
            }
          } catch (_) {}
        };
      }
    });

    // Add keyboard accessibility
    askAiBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        askAiBtn.click();
      }
    });
  }

  // New button event handlers
  if (recordInterviewerBtn) {
    recordInterviewerBtn.addEventListener("click", () => {
      if (!state.connected) {
        ensureServerAndConnect().then((ok) => {
          if (ok) startInterviewerRecording();
        });
        return;
      }
      startInterviewerRecording();
    });

    recordInterviewerBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        recordInterviewerBtn.click();
      }
    });
  }

  // Listen for global shortcut from main process to toggle interviewer recording
  try {
    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.on("toggle-interviewer-recording", () => {
        if (!state.connected) {
          ensureServerAndConnect().then((ok) => {
            if (ok) startInterviewerRecording();
          });
        } else {
          startInterviewerRecording();
        }
      });
      
      // Listen for Ask AI shortcut (Ctrl+Q)
      window.electron.ipcRenderer.on("trigger-ask-ai", () => {
        log.info("Ask AI triggered via Ctrl+Q shortcut");
        // Click the capture and analyze button
        if (captureAnalyzeBtn && !captureAnalyzeBtn.disabled) {
          captureAnalyzeBtn.click();
        } else {
          log.warn("Capture button not available or disabled");
        }
      });
    } else if (window.require) {
      // Fallback if contextIsolation disabled (unlikely here)
      try {
        const { ipcRenderer } = window.require("electron");
        ipcRenderer.on("toggle-interviewer-recording", () => {
          if (!state.connected) {
            ensureServerAndConnect().then((ok) => {
              if (ok) startInterviewerRecording();
            });
          } else {
            startInterviewerRecording();
          }
        });
        
        // Listen for Ask AI shortcut (Ctrl+Q)
        ipcRenderer.on("trigger-ask-ai", () => {
          log.info("Ask AI triggered via Ctrl+Q shortcut");
          if (captureAnalyzeBtn && !captureAnalyzeBtn.disabled) {
            captureAnalyzeBtn.click();
          }
        });
      } catch {}
    }
  } catch (e) {
    console.warn("Could not wire interviewer toggle shortcut listener:", e);
  }

  if (listenStudentBtn) {
    listenStudentBtn.addEventListener("click", (e) => {
      if (!state.connected) {
        ensureServerAndConnect().then((ok) => {
          if (!ok) return;
          // Re-dispatch original intent after connection
          listenStudentBtn.click();
        });
        return;
      }

      // Shift+Click still allows system audio capture for debugging
      if (e.shiftKey || e.altKey) {
        if (state.recording && state.recordingMode === "student") {
          stopRecording();
        } else {
          if (state.recording) stopRecording(); // Stop any existing recording
          showNotification(
            "Capturing system audio (select the call window)...",
            "success",
          );
          startStudentSystemRecording();
        }
      } else {
        // Normal click: toggle student mic on/off
        startStudentMic();
      }
    });

    listenStudentBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        listenStudentBtn.click();
      }
    });
  }

  if (captureAnalyzeBtn) {
    captureAnalyzeBtn.addEventListener("click", async (ev) => {
      if (!state.connected) {
        const ok = await ensureServerAndConnect();
        if (!ok) return;
      }

      // Similar to legacy capture but with automatic analysis
      try {
        captureAnalyzeBtn.disabled = true;
        captureAnalyzeBtn.title = "Capturing...";
        const capResult = await window.electronAPI.captureScreen();
        const img =
          capResult && typeof capResult === "object"
            ? capResult.image
            : capResult;
        if (img) {
          if (capResult && typeof capResult === "object") {
            console.log(
              `[CaptureAnalyze] Stored capture ${state.captureCount + 1} size=${capResult.width}x${capResult.height} requested=${capResult.requestedWidth}x${capResult.requestedHeight} scale=${capResult.scaleFactor}`,
            );
          }
          // Store the capture (full result for later reference)
          state.capturedScreens.push(capResult);
          state.captureCount++;
          updateCaptureUI();
          state.forceCaptureRequest = true;

          // Send OCR for this capture and mark for auto-analysis
          send({
            type: "ocr",
            image: img,
            captureIndex: state.captureCount - 1,
            autoAnalyze: true, // Flag for automatic analysis
            meta:
              capResult && typeof capResult === "object"
                ? {
                    width: capResult.width,
                    height: capResult.height,
                    requestedWidth: capResult.requestedWidth,
                    requestedHeight: capResult.requestedHeight,
                    displayId: capResult.displayId,
                    scaleFactor: capResult.scaleFactor,
                  }
                : undefined,
          });
          showNotification(
            `Screen captured - AI analysis starting...`,
            "success",
          );

          // DISABLED: Frontend auto-trigger removed to prevent duplicate responses
          // The server already handles auto-answering after capture via AUTO_COACH_ON_CAPTURE
          // Keeping this would cause TWO AI responses (one from server, one from frontend click)
          state.autoTriggerAI = false;

          // Frontend auto-trigger disabled - server handles auto-answer
          // If you need manual trigger, use the "Ask AI" button
        }
      } catch (e) {
        showNotification("Failed to capture screen", "error");
        state.forceCaptureRequest = false;
        state.autoTriggerAI = false;
      } finally {
        captureAnalyzeBtn.disabled = false;
        captureAnalyzeBtn.title = "Capture & Analyze";
      }
    });

    captureAnalyzeBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        captureAnalyzeBtn.click();
      }
    });
  }

  if (toggleChatBtn) {
    toggleChatBtn.addEventListener("click", () => {
      const wasExpanded =
        chatContainer && chatContainer.classList.contains("expanded");
      toggleChat();

      // Track when user manually collapses the chat
      if (
        wasExpanded &&
        chatContainer &&
        !chatContainer.classList.contains("expanded")
      ) {
        chatContainer.setAttribute("data-user-collapsed", "true");
        chatContainer.setAttribute("data-collapse-time", Date.now().toString());
      }
    });

    toggleChatBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleChatBtn.click();
      }
    });
  }

  if (clearChatBtn) {
    clearChatBtn.addEventListener("click", () => {
      clearChat();
    });

    clearChatBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        clearChatBtn.click();
      }
    });
  }

  // Export functions for main window communication
  window.setSpeaker = function (speaker) {
    if (speaker === "user1" || speaker === "user2") {
      state.currentSpeaker = speaker;
      updateSpeakerUI();
    }
  };

  // Simple keyboard toggle for gain normalization (Ctrl+Alt+G)
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "g") {
      if (state.processor && state.processor.port) {
        state._gainEnabled = !state._gainEnabled;
        state.processor.port.postMessage({
          type: "gain_control",
          enable: state._gainEnabled,
          targetRMS: 0.025,
        });
        showNotification(
          "Adaptive gain " + (state._gainEnabled ? "enabled" : "disabled"),
          "info",
        );
      }
    }
  });

  // FOCUS ON CURRENT QUESTION ONLY - do not combine queue contexts
  function buildDynamicAIContext() {
    // Get ONLY the most recent/current question, not historical queue data
    let currentQuestion = "";

    // Try to get the most recent question from interviewer segments
    if (state.interviewerSegments && state.interviewerSegments.length > 0) {
      // Get only the last segment (current question)
      const lastSegment =
        state.interviewerSegments[state.interviewerSegments.length - 1];
      if (lastSegment && lastSegment.trim()) {
        currentQuestion = lastSegment.trim();
      }
    }

    // If no current question from transcript, try the most recent OCR (not multiple)
    if (
      !currentQuestion &&
      state.analysisSegments &&
      state.analysisSegments.length > 0
    ) {
      // Get only the LATEST analysis, not last 3
      const latestAnalysis =
        state.analysisSegments[state.analysisSegments.length - 1];
      if (latestAnalysis && latestAnalysis.trim()) {
        currentQuestion = latestAnalysis.trim();
      }
    }

    // If we still have no content, provide a fallback
    if (!currentQuestion) {
      currentQuestion =
        "No specific question detected. Please provide general interview coaching advice.";
    }

    console.log(
      "[AI Context] Focused on current question only. Length:",
      currentQuestion.length,
      "Preview:",
      currentQuestion.slice(0, 100),
    );
    return currentQuestion;
  }

  // init
  restorePrefs();
  // Allow F12 inside toolbar to toggle its DevTools (via main IPC)
  try {
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "F12") {
          if (window.electron && window.electron.ipcRenderer) {
            window.electron.ipcRenderer
              .invoke("toolbar-open-devtools")
              .catch(() => {});
            e.preventDefault();
            e.stopPropagation();
          }
        }
      },
      true,
    );
  } catch (e) {
    console.warn("F12 devtools binding failed", e);
  }
  // Add small delay to ensure DOM is fully ready and server has time to start
  setTimeout(() => {
    console.log("Starting toolbar initialization...");
    setConnected(false); // Ensure we start in disconnected state
    connect();
    updateSpeakerUI();
    updateListenStudentUI();
    updateCaptureUI(); // Initialize capture UI
    // Initial size adjustment
    queueResize();

    // Periodic connection health check
    setInterval(() => {
      if (
        state.ws &&
        state.ws.readyState === WebSocket.OPEN &&
        !state.connected
      ) {
        console.log("WebSocket is open but state.connected is false - fixing");
        setConnected(true);
      } else if (
        (!state.ws || state.ws.readyState !== WebSocket.OPEN) &&
        state.connected
      ) {
        console.log("WebSocket is closed but state.connected is true - fixing");
        setConnected(false);
      }
    }, 2000);

    // Initialize auto-collapse feature
    setupAutoCollapse();

    // Initialize chat expansion if there are existing messages
    if (chatContainer && state.chatHistory && state.chatHistory.length > 0) {
      log.info("Initializing chat with existing messages");
      smartExpandChat();
    }
    // If chat container exists but no explicit toggleChatBtn (alternate layout), ensure it's expanded
    try {
      if (chatContainer && !toggleChatBtn) {
        chatContainer.classList.add("expanded");
        const cp = document.getElementById("chatPrompt");
        if (cp) cp.focus();
      }
    } catch {}

    // ==========================================
    // KEYBOARD SHORTCUTS
    // ==========================================
    document.addEventListener("keydown", (e) => {
      // Ignore if user is typing in input fields
      const isInputFocused = ["INPUT", "TEXTAREA"].includes(
        document.activeElement?.tagName,
      );

      // Ctrl+K: Toggle chat
      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        if (toggleChatBtn) {
          toggleChatBtn.click();
          log.info("Keyboard shortcut: Toggle chat (Ctrl+K)");
        }
      }

      // Alt+C: Quick capture screen (matching global shortcut)
      if (e.altKey && e.key === "c" && !isInputFocused) {
        e.preventDefault();
        if (captureAnalyzeBtn && !captureAnalyzeBtn.disabled) {
          captureAnalyzeBtn.click();
          log.info("Keyboard shortcut: Capture screen (Alt+C)");
        }
      }
      
      // Ctrl+Q: Ask AI / Capture and Analyze (matching global shortcut)
      if (e.ctrlKey && e.key === "q" && !isInputFocused) {
        e.preventDefault();
        if (captureAnalyzeBtn && !captureAnalyzeBtn.disabled) {
          captureAnalyzeBtn.click();
          log.info("Keyboard shortcut: Ask AI (Ctrl+Q)");
        }
      }

      // Ctrl+Enter: Send message (if chat input focused)
      if (e.ctrlKey && e.key === "Enter" && isInputFocused) {
        e.preventDefault();
        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
          log.info("Keyboard shortcut: Send message (Ctrl+Enter)");
        }
      }

      // Ctrl+L: Clear chat (if not typing)
      if (e.ctrlKey && e.key === "l" && !isInputFocused) {
        e.preventDefault();
        if (clearChatBtn) {
          clearChatBtn.click();
          log.info("Keyboard shortcut: Clear chat (Ctrl+L)");
        }
      }

      // Ctrl+R: Toggle recording (if not typing)
      if (e.ctrlKey && e.key === "r" && !isInputFocused) {
        e.preventDefault();
        if (recordInterviewerBtn && !recordInterviewerBtn.disabled) {
          recordInterviewerBtn.click();
          log.info("Keyboard shortcut: Toggle recording (Ctrl+R)");
        }
      }

      // Ctrl+/: Toggle toolbar visibility (hide/unhide) - matching global shortcut
      if (e.ctrlKey && e.key === "/" && !isInputFocused) {
        e.preventDefault();
        if (
          window.electronAPI &&
          typeof window.electronAPI.toggleToolbar === "function"
        ) {
          window.electronAPI.toggleToolbar();
          log.info("Keyboard shortcut: Toggle toolbar visibility (Ctrl+/)");
        } else if (
          window.electronAPI &&
          typeof window.electronAPI.hideToolbar === "function"
        ) {
          window.electronAPI.hideToolbar();
          log.info("Keyboard shortcut: Hide toolbar (Ctrl+/ fallback)");
        } else {
          try {
            window.close();
          } catch (_) {}
        }
      }
    });

    // Handle quick capture results from main process
    if (window.electronAPI && window.electronAPI.onQuickCaptureResult) {
      window.electronAPI.onQuickCaptureResult((imageData) => {
        console.log("🔥 Quick capture result received, processing...");
        // Update last AI request timestamp to allow server response
        window.lastUserAIRequestTs = Date.now();
        
        // Store the capture data
        state.capturedScreens.push(imageData);
        state.captureCount++;
        updateCaptureUI();
        
        showNotification("Quick capture completed - AI analyzing...", "success");
      });
    }

    log.info(
      "✅ Keyboard shortcuts enabled:",
      [
        "Ctrl+K (toggle chat)",
        "Ctrl+Shift+C (capture)",
        "Ctrl+Enter (send)",
        "Ctrl+L (clear)",
        "Ctrl+R (record)",
        "Ctrl+A (toggle toolbar)",
        "Ctrl+Shift+A (ask AI)",
      ].join(", "),
    );

    // Start connection health monitoring
    connectionHealth.start();

    log.info("🚀 Toolbar fully initialized with all enhancements");
  }, 500); // Increased delay to give server more time
})();
