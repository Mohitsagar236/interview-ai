/* renderer/settings.js — BYOK Settings UI */
'use strict';

const api = window.electronAPI;

// ── Provider metadata ──────────────────────────────────────────────────────
const PROVIDERS = {
  openai:      { keyField: 'openaiKey',      modelField: 'openaiModel',      statusId: 'openaiStatus',      testId: 'testOpenai',      storeKey: 'openai',      defaultModel: 'gpt-4o-mini' },
  anthropic:   { keyField: 'anthropicKey',   modelField: 'anthropicModel',   statusId: 'anthropicStatus',   testId: 'testAnthropic',   storeKey: 'anthropic',   defaultModel: 'claude-3-5-haiku-latest' },
  gemini:      { keyField: 'geminiKey',      modelField: 'geminiModel',      statusId: 'geminiStatus',      testId: 'testGemini',      storeKey: 'gemini',      defaultModel: 'gemini-1.5-flash' },
  groq:        { keyField: 'groqKey',        modelField: 'groqModel',        statusId: 'groqStatus',        testId: 'testGroq',        storeKey: 'groq',        defaultModel: 'llama3-70b-8192' },
  openrouter:  { keyField: 'openrouterKey',  modelField: 'openrouterModel',  statusId: 'openrouterStatus',  testId: 'testOpenrouter',  storeKey: 'openrouter',  defaultModel: 'openai/gpt-4o-mini' },
  xai:         { keyField: 'xaiKey',         modelField: 'xaiModel',         statusId: 'xaiStatus',         testId: 'testXai',         storeKey: 'xai',         defaultModel: 'grok-beta' },
  ollama:      { keyField: null,             modelField: 'ollamaModel',      statusId: 'ollamaStatus',      testId: 'testOllama',      storeKey: 'ollama',      defaultModel: 'llama3' },
  custom:      { keyField: 'customKey',      modelField: 'customModel',      statusId: null,                testId: null,              storeKey: 'custom',      defaultModel: '' },
};

let currentProvider = 'openai';

// ── Utility ────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function setStatus(id, state, text) {
  const el = $(id);
  if (!el) return;
  el.className = `status-badge ${state}`;
  el.textContent = text;
}

function flashSaveStatus() {
  const el = $('saveStatus');
  if (!el) return;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2500);
}

const MAX_RESUME_SIZE = 10 * 1024 * 1024;

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function updateResumeUi(resume) {
  const hasResume = !!(resume && resume.name);
  const title = $('resumeTitle');
  const meta = $('resumeMeta');
  const status = $('resumeStatus');
  const remove = $('resumeRemove');

  if (title) title.textContent = hasResume ? resume.name : 'No resume uploaded';
  if (meta) {
    meta.textContent = hasResume
      ? [formatFileSize(resume.size), resume.updatedAt ? `Updated ${new Date(resume.updatedAt).toLocaleString()}` : ''].filter(Boolean).join(' · ')
      : 'PDF, DOCX, DOC, or TXT up to 10MB';
  }
  if (status) {
    status.className = `status-badge ${hasResume ? 'ok' : 'idle'}`;
    status.textContent = hasResume ? 'Ready' : 'Not set';
  }
  if (remove) remove.style.display = hasResume ? 'inline-flex' : 'none';
}

async function loadResumeStatus() {
  let resume = null;
  try {
    const result = await api?.resume?.getCurrent?.();
    resume = result && result.ok ? result.resume : null;
  } catch (e) {
    console.warn('Failed to load resume status:', e);
  }

  if (!resume) {
    const name = localStorage.getItem('uploaded_resume_name');
    const content = localStorage.getItem('resume_content');
    if (name && content) resume = { name };
  }

  updateResumeUi(resume);
}

async function saveResumeFile(file) {
  const status = $('resumeStatus');
  if (!file) return;
  if (file.size > MAX_RESUME_SIZE) {
    setStatus('resumeStatus', 'err', 'Too large');
    return;
  }

  const allowed = /\.(pdf|doc|docx|txt)$/i.test(file.name);
  if (!allowed) {
    setStatus('resumeStatus', 'err', 'Unsupported');
    return;
  }

  try {
    if (status) {
      status.className = 'status-badge testing';
      status.textContent = 'Uploading...';
    }
    const content = arrayBufferToBase64(await file.arrayBuffer());
    localStorage.setItem('uploaded_resume_name', file.name);
    localStorage.setItem('resume_content', content);

    const result = await api?.resume?.setCurrent?.({
      name: file.name,
      content,
      size: file.size,
      type: file.type || '',
    });
    if (result && !result.ok) throw new Error(result.error || 'Resume save failed');

    updateResumeUi({
      name: file.name,
      size: file.size,
      type: file.type || '',
      updatedAt: new Date().toISOString(),
    });
    flashSaveStatus();
  } catch (e) {
    console.error('Resume upload failed:', e);
    setStatus('resumeStatus', 'err', 'Failed');
  }
}

async function clearResume() {
  localStorage.removeItem('uploaded_resume_name');
  localStorage.removeItem('resume_content');
  try {
    await api?.resume?.clearCurrent?.();
  } catch (e) {
    console.warn('Failed to clear stored resume:', e);
  }
  updateResumeUi(null);
  flashSaveStatus();
}

// ── Navigation ─────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    item.classList.add('active');
    const sec = $(`section-${item.dataset.section}`);
    if (sec) sec.classList.add('active');
  });
});

// ── Provider grid ──────────────────────────────────────────────────────────
document.querySelectorAll('.provider-card').forEach(card => {
  card.addEventListener('click', () => {
    selectProvider(card.dataset.provider);
  });
});

function selectProvider(provider) {
  currentProvider = provider;
  document.querySelectorAll('.provider-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.provider === provider);
  });
  document.querySelectorAll('.provider-section').forEach(s => s.classList.remove('active'));
  const ps = $(`ps-${provider}`);
  if (ps) ps.classList.add('active');
}

// ── Load existing settings ─────────────────────────────────────────────────
async function loadSettings() {
  if (!api || !api.settings) return;

  try {
    const all = await api.settings.getAll();

    // Deepgram
    if (all.deepgram) {
      const key = await api.settings.getApiKey('deepgram');
      if (key) { $('deepgramKey').value = key; setStatus('deepgramStatus', 'ok', 'Saved'); }
      const modelEl = $('deepgramModel');
      if (modelEl && all.deepgram.model) modelEl.value = all.deepgram.model;
      const langEl = $('deepgramLanguage');
      if (langEl && all.deepgram.language) langEl.value = all.deepgram.language;
    }

    // AI provider keys
    for (const [provider, meta] of Object.entries(PROVIDERS)) {
      if (meta.keyField) {
        const key = await api.settings.getApiKey(meta.storeKey);
        if (key) {
          const el = $(meta.keyField);
          if (el) el.value = key;
          if (meta.statusId) setStatus(meta.statusId, 'ok', 'Saved');
        }
      }
    }

    // AI config
    const ai = all.ai || {};
    if (ai.provider) selectProvider(ai.provider);
    if (ai.model) {
      const meta = PROVIDERS[ai.provider || 'openai'];
      if (meta && meta.modelField) {
        const el = $(meta.modelField);
        if (el) el.value = ai.model;
      }
    }
    if (ai.baseUrl) {
      if (ai.provider === 'ollama' && $('ollamaBaseUrl')) $('ollamaBaseUrl').value = ai.baseUrl;
      if (ai.provider === 'custom' && $('customBaseUrl')) $('customBaseUrl').value = ai.baseUrl;
    }

    // Behavior
    if ($('smartRouting')) $('smartRouting').checked = ai.smartRouting !== false;
    if ($('budgetMode')) $('budgetMode').checked = !!ai.budgetMode;
    if ($('maxCostPerRequest') && ai.maxCostPerRequest != null) $('maxCostPerRequest').value = String(ai.maxCostPerRequest);

    // App prefs
    const appCfg = all.app || {};
    if ($('launchOnStartup')) $('launchOnStartup').checked = !!appCfg.launchOnStartup;
    if ($('minimizeToTray')) $('minimizeToTray').checked = appCfg.minimizeToTray !== false;

    // About
    const aboutEl = $('aboutInfo');
    if (aboutEl) {
      aboutEl.innerHTML = `
        <strong>Version:</strong> ${all.appVersion || '1.0.0'}<br />
        <strong>Mode:</strong> Free BYOK<br />
        <strong>Website:</strong> github.com/Mohitsagar236/interview-ai
      `;
    }

    await loadResumeStatus();
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

// ── Save all settings ──────────────────────────────────────────────────────
async function saveAll() {
  if (!api || !api.settings) return;

  // Deepgram key
  const deepgramKey = $('deepgramKey') ? $('deepgramKey').value.trim() : '';
  if (deepgramKey) await api.settings.saveApiKey('deepgram', deepgramKey);

  const deepgramModel = $('deepgramModel') ? $('deepgramModel').value : 'nova-2';
  const deepgramLanguage = $('deepgramLanguage') ? $('deepgramLanguage').value : 'en-US';
  await api.settings.set('deepgram', { model: deepgramModel, language: deepgramLanguage });

  // Active AI provider key
  const meta = PROVIDERS[currentProvider];
  if (meta && meta.keyField) {
    const keyEl = $(meta.keyField);
    if (keyEl && keyEl.value.trim()) {
      await api.settings.saveApiKey(meta.storeKey, keyEl.value.trim());
      // Also store as 'ai_primary' so init_session can read it generically
      await api.settings.saveApiKey('ai_primary', keyEl.value.trim());
    }
  }

  // Model & base URL
  const modelEl = meta && meta.modelField ? $(meta.modelField) : null;
  const model = modelEl ? modelEl.value.trim() : '';

  let baseUrl = '';
  if (currentProvider === 'ollama' && $('ollamaBaseUrl')) baseUrl = $('ollamaBaseUrl').value.trim();
  if (currentProvider === 'custom' && $('customBaseUrl')) baseUrl = $('customBaseUrl').value.trim();

  // Behavior
  const smartRouting = $('smartRouting') ? $('smartRouting').checked : true;
  const budgetMode = $('budgetMode') ? $('budgetMode').checked : false;
  const maxCost = parseFloat($('maxCostPerRequest') ? $('maxCostPerRequest').value : '0') || 0;

  await api.settings.set('ai', {
    provider: currentProvider,
    model: model || (meta ? meta.defaultModel : ''),
    baseUrl,
    smartRouting,
    budgetMode,
    maxCostPerRequest: maxCost,
  });

  // App prefs
  await api.settings.set('app', {
    launchOnStartup: $('launchOnStartup') ? $('launchOnStartup').checked : false,
    minimizeToTray: $('minimizeToTray') ? $('minimizeToTray').checked : true,
  });

  flashSaveStatus();

  // Restart Python server so it picks up the newly saved API keys
  if (api.restartServer) {
    try { await api.restartServer(); } catch {}
  }
}

// ── Test connection helpers ────────────────────────────────────────────────
async function testDeepgram() {
  const key = $('deepgramKey') ? $('deepgramKey').value.trim() : '';
  if (!key) { setStatus('deepgramStatus', 'warn', 'Enter key first'); return; }
  setStatus('deepgramStatus', 'testing', 'Testing…');
  try {
    const res = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${key}` },
    });
    if (res.ok) {
      setStatus('deepgramStatus', 'ok', '✓ Valid');
    } else {
      setStatus('deepgramStatus', 'err', `✗ ${res.status}`);
    }
  } catch (e) {
    setStatus('deepgramStatus', 'err', '✗ Network error');
  }
}

async function testOpenAI() {
  const key = $('openaiKey') ? $('openaiKey').value.trim() : '';
  if (!key) { setStatus('openaiStatus', 'warn', 'Enter key first'); return; }
  setStatus('openaiStatus', 'testing', 'Testing…');
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    setStatus('openaiStatus', res.ok ? 'ok' : 'err', res.ok ? '✓ Valid' : `✗ ${res.status}`);
  } catch { setStatus('openaiStatus', 'err', '✗ Network error'); }
}

async function testAnthropic() {
  const key = $('anthropicKey') ? $('anthropicKey').value.trim() : '';
  if (!key) { setStatus('anthropicStatus', 'warn', 'Enter key first'); return; }
  setStatus('anthropicStatus', 'testing', 'Testing…');
  try {
    // Anthropic doesn't have a simple health endpoint; try models list
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    });
    setStatus('anthropicStatus', res.ok ? 'ok' : 'err', res.ok ? '✓ Valid' : `✗ ${res.status}`);
  } catch { setStatus('anthropicStatus', 'err', '✗ Network error'); }
}

async function testGemini() {
  const key = $('geminiKey') ? $('geminiKey').value.trim() : '';
  if (!key) { setStatus('geminiStatus', 'warn', 'Enter key first'); return; }
  setStatus('geminiStatus', 'testing', 'Testing…');
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    setStatus('geminiStatus', res.ok ? 'ok' : 'err', res.ok ? '✓ Valid' : `✗ ${res.status}`);
  } catch { setStatus('geminiStatus', 'err', '✗ Network error'); }
}

async function testGroq() {
  const key = $('groqKey') ? $('groqKey').value.trim() : '';
  if (!key) { setStatus('groqStatus', 'warn', 'Enter key first'); return; }
  setStatus('groqStatus', 'testing', 'Testing…');
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    setStatus('groqStatus', res.ok ? 'ok' : 'err', res.ok ? '✓ Valid' : `✗ ${res.status}`);
  } catch { setStatus('groqStatus', 'err', '✗ Network error'); }
}

async function testOpenrouter() {
  const key = $('openrouterKey') ? $('openrouterKey').value.trim() : '';
  if (!key) { setStatus('openrouterStatus', 'warn', 'Enter key first'); return; }
  setStatus('openrouterStatus', 'testing', 'Testing…');
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    setStatus('openrouterStatus', res.ok ? 'ok' : 'err', res.ok ? '✓ Valid' : `✗ ${res.status}`);
  } catch { setStatus('openrouterStatus', 'err', '✗ Network error'); }
}

async function testXai() {
  const key = $('xaiKey') ? $('xaiKey').value.trim() : '';
  if (!key) { setStatus('xaiStatus', 'warn', 'Enter key first'); return; }
  setStatus('xaiStatus', 'testing', 'Testing...');
  try {
    const res = await fetch('https://api.x.ai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    setStatus('xaiStatus', res.ok ? 'ok' : 'err', res.ok ? 'Valid' : `${res.status}`);
  } catch { setStatus('xaiStatus', 'err', 'Network error'); }
}

async function testOllama() {
  const baseUrl = ($('ollamaBaseUrl') ? $('ollamaBaseUrl').value.trim() : '') || 'http://localhost:11434';
  setStatus('ollamaStatus', 'testing', 'Testing…');
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    setStatus('ollamaStatus', res.ok ? 'ok' : 'err', res.ok ? '✓ Running' : `✗ ${res.status}`);
  } catch { setStatus('ollamaStatus', 'err', '✗ Not reachable'); }
}

// ── Claude Account ─────────────────────────────────────────────────────────
async function loadClaudeAccountStatus() {
  if (!api || !api.claudeAccount) return;
  try {
    const status = await api.claudeAccount.getStatus();
    const connectedEl  = $('claudeAccountConnected');
    const disconnectedEl = $('claudeAccountDisconnected');
    const maskedEl     = $('claudeAccountMasked');
    if (status.connected) {
      if (connectedEl)   connectedEl.style.display   = 'block';
      if (disconnectedEl) disconnectedEl.style.display = 'none';
      if (maskedEl)      maskedEl.textContent = status.maskedKey || '';
    } else {
      if (connectedEl)   connectedEl.style.display   = 'none';
      if (disconnectedEl) disconnectedEl.style.display = 'block';
    }
  } catch (e) {
    console.error('Failed to load Claude Account status:', e);
  }
}

async function handleClaudeAccountSignIn() {
  const btn      = $('claudeAccountSignIn');
  const statusEl = $('claudeAccountStatus');
  const keyInput = $('claudeAccountKeyInput');
  const apiKey   = keyInput ? keyInput.value.trim() : '';

  if (!apiKey) {
    setStatus('claudeAccountStatus', 'err', '✗ Paste your API key first');
    return;
  }
  if (!apiKey.startsWith('sk-ant-')) {
    setStatus('claudeAccountStatus', 'err', '✗ Key must start with sk-ant-');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }
  setStatus('claudeAccountStatus', 'testing', 'Validating…');

  try {
    const result = await api.claudeAccount.signIn(apiKey);
    if (result && result.ok) {
      setStatus('claudeAccountStatus', 'ok', '✓ Connected!');
      if (keyInput) keyInput.value = '';
      await loadClaudeAccountStatus();
      flashSaveStatus();
    } else {
      setStatus('claudeAccountStatus', 'err', result?.error || '✗ Failed');
    }
  } catch (e) {
    console.error('Claude Account sign-in error:', e);
    setStatus('claudeAccountStatus', 'err', '✗ Error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Connect'; }
  }
}

async function handleClaudeAccountSignOut() {
  if (!confirm('Disconnect Claude Account? The imported API key will be removed.')) return;
  try {
    await api.claudeAccount.signOut();
    await loadClaudeAccountStatus();
  } catch (e) {
    console.error('Claude Account sign-out error:', e);
  }
}

// ── Wire up buttons ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadClaudeAccountStatus();

  $('testDeepgram')   && $('testDeepgram').addEventListener('click', testDeepgram);
  $('testOpenai')     && $('testOpenai').addEventListener('click', testOpenAI);
  $('testAnthropic')  && $('testAnthropic').addEventListener('click', testAnthropic);
  $('testGemini')     && $('testGemini').addEventListener('click', testGemini);
  $('testGroq')       && $('testGroq').addEventListener('click', testGroq);
  $('testOpenrouter') && $('testOpenrouter').addEventListener('click', testOpenrouter);
  $('testXai')        && $('testXai').addEventListener('click', testXai);
  $('testOllama')     && $('testOllama').addEventListener('click', testOllama);

  $('claudeAccountOpenConsole') && $('claudeAccountOpenConsole').addEventListener('click', () => {
    api.shell?.openExternal?.('https://console.anthropic.com/settings/keys');
  });
  $('claudeAccountSignIn')  && $('claudeAccountSignIn').addEventListener('click', handleClaudeAccountSignIn);
  $('claudeAccountSignOut') && $('claudeAccountSignOut').addEventListener('click', handleClaudeAccountSignOut);

  const resumeInput = $('resumeFileInput');
  const resumeDropZone = $('resumeDropZone');
  const resumeBrowse = $('resumeBrowse');
  const resumeRemove = $('resumeRemove');

  const pickResume = () => resumeInput && resumeInput.click();
  resumeBrowse && resumeBrowse.addEventListener('click', (event) => {
    event.stopPropagation();
    pickResume();
  });
  resumeDropZone && resumeDropZone.addEventListener('click', pickResume);
  resumeInput && resumeInput.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) await saveResumeFile(file);
    event.target.value = '';
  });
  resumeRemove && resumeRemove.addEventListener('click', async (event) => {
    event.stopPropagation();
    await clearResume();
  });
  if (resumeDropZone) {
    ['dragenter', 'dragover'].forEach(type => {
      resumeDropZone.addEventListener(type, (event) => {
        event.preventDefault();
        resumeDropZone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(type => {
      resumeDropZone.addEventListener(type, (event) => {
        event.preventDefault();
        if (type === 'drop') {
          const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
          if (file) saveResumeFile(file);
        }
        resumeDropZone.classList.remove('dragover');
      });
    });
  }

  $('saveAll') && $('saveAll').addEventListener('click', saveAll);
  $('cancelBtn') && $('cancelBtn').addEventListener('click', () => window.close());

  $('clearAllKeys') && $('clearAllKeys').addEventListener('click', async () => {
    if (!confirm('Clear ALL API keys and settings? This cannot be undone.')) return;
    if (api && api.settings) {
      await api.settings.clearAll();
      location.reload();
    }
  });
});
