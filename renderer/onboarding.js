/* renderer/onboarding.js — First-run wizard */
'use strict';

const api = window.electronAPI;

let currentStep = 1;
let selectedProvider = 'openai';

// ── Helpers ────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function setStatus(id, state, text) {
  const el = $(id);
  if (!el) return;
  el.className = `status-badge ${state}`;
  el.textContent = text;
}

function goToStep(n) {
  document.querySelectorAll('.step-page').forEach(p => p.classList.remove('active'));
  const page = $(`step${n}`);
  if (page) page.classList.add('active');

  // Update dots & lines
  for (let i = 1; i <= 4; i++) {
    const dot = $(`dot${i}`);
    if (!dot) continue;
    if (i < n) { dot.className = 'step-dot done'; dot.textContent = '✓'; }
    else if (i === n) { dot.className = 'step-dot active'; dot.textContent = String(i); }
    else { dot.className = 'step-dot'; dot.textContent = String(i); }
  }
  for (let i = 1; i <= 3; i++) {
    const line = $(`line${i}`);
    if (line) line.className = `step-line${i < n ? ' done' : ''}`;
  }
  currentStep = n;
  if (n === 4) updateDoneChecklist();
}

async function updateDoneChecklist() {
  const list = $('doneChecklist');
  const subtitle = $('doneSubtitle');
  if (!list || !api || !api.settings) return;

  const [hasDeepgram, hasAi] = await Promise.all([
    api.settings.hasDeepgramKey(),
    api.settings.hasAiKey(),
  ]);

  const item = (ok, label, detail) => `<li><span class="ck">${ok ? '✓' : '!'}</span> ${label}${detail ? ` <small>${detail}</small>` : ''}</li>`;
  list.innerHTML = [
    item(hasDeepgram, hasDeepgram ? 'Deepgram transcription configured' : 'Deepgram key missing', hasDeepgram ? '' : 'Add it in Settings for live transcription.'),
    item(hasAi, hasAi ? 'AI provider configured' : 'AI provider key missing', hasAi ? '' : 'Add one provider key in Settings for answers.'),
    item(true, 'Keys are stored encrypted locally', ''),
  ].join('');

  if (subtitle) {
    subtitle.textContent = hasDeepgram && hasAi
      ? 'Interview AI is configured and ready. You can change these settings anytime in Settings.'
      : 'Setup is saved, but some keys are missing. Open Settings after launch to enable every feature.';
  }
}

// ── Provider selector ──────────────────────────────────────────────────────
document.querySelectorAll('#ob_providerGrid .provider-card').forEach(card => {
  card.addEventListener('click', () => {
    selectedProvider = card.dataset.provider;
    document.querySelectorAll('#ob_providerGrid .provider-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.provider === selectedProvider);
    });
    // Show correct fields
    ['openai','anthropic','gemini','groq','openrouter','ollama'].forEach(p => {
      const el = $(`ob_ps-${p}`);
      if (el) el.style.display = p === selectedProvider ? 'block' : 'none';
    });
  });
});

// ── Step navigation ────────────────────────────────────────────────────────
$('step1Next').addEventListener('click', () => goToStep(2));

$('step2Back').addEventListener('click', () => goToStep(1));
$('step2Skip').addEventListener('click', () => goToStep(3));
$('step2Next').addEventListener('click', async () => {
  const key = $('ob_deepgramKey') ? $('ob_deepgramKey').value.trim() : '';
  if (key && api && api.settings) {
    await api.settings.saveApiKey('deepgram', key);
    const model = $('ob_deepgramModel') ? $('ob_deepgramModel').value : 'nova-2';
    await api.settings.set('deepgram', { model });
  }
  goToStep(3);
});

$('step3Back').addEventListener('click', () => goToStep(2));
$('step3Skip').addEventListener('click', () => goToStep(4));
$('step3Next').addEventListener('click', async () => {
  if (api && api.settings) {
    // Save provider key
    const keyMap = {
      openai: 'ob_openaiKey',
      anthropic: 'ob_anthropicKey',
      gemini: 'ob_geminiKey',
      groq: 'ob_groqKey',
      openrouter: 'ob_openrouterKey',
      ollama: null,
    };
    const modelMap = {
      openai: 'ob_openaiModel',
      anthropic: 'ob_anthropicModel',
      gemini: 'ob_geminiModel',
      groq: 'ob_groqModel',
      openrouter: 'ob_openrouterModel',
      ollama: 'ob_ollamaModel',
    };
    const keyFieldId = keyMap[selectedProvider];
    const modelFieldId = modelMap[selectedProvider];

    if (keyFieldId) {
      const key = $(keyFieldId) ? $(keyFieldId).value.trim() : '';
      if (key) {
        await api.settings.saveApiKey(selectedProvider, key);
        await api.settings.saveApiKey('ai_primary', key);
      }
    }

    const model = modelFieldId && $(modelFieldId) ? $(modelFieldId).value.trim() : '';
    let baseUrl = '';
    if (selectedProvider === 'ollama') {
      baseUrl = $('ob_ollamaBaseUrl') ? $('ob_ollamaBaseUrl').value.trim() : 'http://localhost:11434';
    }

    await api.settings.set('ai', {
      provider: selectedProvider,
      model: model || getDefaultModel(selectedProvider),
      baseUrl,
      smartRouting: true,
      budgetMode: false,
      maxCostPerRequest: 0.10,
    });
  }
  goToStep(4);
});

$('launchBtn').addEventListener('click', async () => {
  if (api && api.onboardingComplete) {
    await api.onboardingComplete();
  }
  window.close();
});

// ── Defaults ───────────────────────────────────────────────────────────────
function getDefaultModel(provider) {
  const defaults = {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-latest',
    gemini: 'gemini-1.5-flash',
    groq: 'llama3-70b-8192',
    openrouter: 'openai/gpt-4o-mini',
    ollama: 'llama3',
  };
  return defaults[provider] || '';
}
