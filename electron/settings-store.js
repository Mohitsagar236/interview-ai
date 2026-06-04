/**
 * Settings Store — encrypted local persistence for Interview AI (Open Source)
 * Uses electron-store for persistence + Electron safeStorage for API key encryption.
 */

const Store = require('electron-store');
const { safeStorage } = require('electron');

const store = new Store({
  name: 'interview-ai-settings',
  defaults: {
    onboardingComplete: false,
    deepgram: {
      model: 'nova-2',
      language: 'en-US'
    },
    ai: {
      provider: null, // 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'groq' | 'openrouter' | 'custom'
      model: null,
      baseUrl: null,
      smartRouting: true,
      budgetMode: false,
      maxCostPerRequest: 0.10,
      responseLanguage: 'auto'
    },
    app: {
      theme: 'system',
      overlayOpacity: 90,
      fontSize: 'medium',
      autoStart: false
    }
  }
});

/**
 * Save an API key encrypted via safeStorage.
 * Falls back to base64 obfuscation if safeStorage is unavailable.
 * @param {string} provider  e.g. 'openai', 'deepgram', 'anthropic', …
 * @param {string} key       The raw API key string
 */
function saveApiKey(provider, key) {
  if (!key) {
    store.delete(`keys.${provider}`);
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback: store with base64 obfuscation and warn
    console.warn('[Settings] safeStorage not available — storing API key with base64 fallback');
    store.set(`keys.${provider}`, Buffer.from(key).toString('base64'));
    return;
  }
  const encrypted = safeStorage.encryptString(key);
  store.set(`keys.${provider}`, encrypted.toString('base64'));
}

/**
 * Retrieve a stored API key, decrypting as needed.
 * @param {string} provider
 * @returns {string|null}
 */
function getApiKey(provider) {
  const stored = store.get(`keys.${provider}`);
  if (!stored) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    try {
      return Buffer.from(stored, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch {
    return null;
  }
}

/**
 * Delete all stored API keys.
 */
function clearAllKeys() {
  store.delete('keys');
}

/**
 * Check whether at least one AI provider key is configured.
 * @returns {boolean}
 */
function hasAnyAiKey() {
  const providers = ['openai', 'anthropic', 'gemini', 'groq', 'openrouter', 'custom'];
  // Ollama needs no key — if provider is ollama, count it as configured
  const aiProvider = store.get('ai.provider');
  if (aiProvider === 'ollama') return true;
  return providers.some(p => !!getApiKey(p));
}

/**
 * Check whether the Deepgram key is configured.
 * @returns {boolean}
 */
function hasDeepgramKey() {
  return !!getApiKey('deepgram');
}

/**
 * Check whether a Claude account API key has been imported via the sign-in flow.
 * @returns {boolean}
 */
function hasClaudeAccount() {
  return !!getApiKey('claude_account');
}

module.exports = { store, saveApiKey, getApiKey, clearAllKeys, hasAnyAiKey, hasDeepgramKey, hasClaudeAccount };
