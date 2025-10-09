/**
 * Configuration Diagnostic Tool
 * Run this in the Electron DevTools console to check your setup
 */

async function runDiagnostics() {
  console.log('🔍 Interview AI Assistant - Configuration Diagnostic');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const results = {
    settings: { status: '❓', details: {} },
    server: { status: '❓', details: {} },
    environment: { status: '❓', details: {} },
    apiKeys: { status: '❓', details: {} }
  };
  
  // Check 1: Settings file
  console.log('\n1️⃣ Checking Settings File...');
  try {
    const settingsCheck = await window.electronAPI.invoke('diagnostic:check-settings');
    results.settings.status = settingsCheck.exists ? '✅' : '❌';
    results.settings.details = settingsCheck;
    
    console.log(settingsCheck.exists ? '✅ Settings file found' : '❌ Settings file not found');
    console.log('   Path:', settingsCheck.path);
    
    if (settingsCheck.exists && settingsCheck.data) {
      console.log('   Has API key:', !!settingsCheck.data.apiKey);
      console.log('   Has OpenRouter key:', !!settingsCheck.data.openrouterApiKey);
      console.log('   Has OpenAI key:', !!settingsCheck.data.openaiApiKey);
      console.log('   Has Deepgram key:', !!settingsCheck.data.deepgramApiKey);
      console.log('   Has AssemblyAI key:', !!settingsCheck.data.assemblyaiApiKey);
      console.log('   Default LLM:', settingsCheck.data.defaultLLM || 'not set');
    }
  } catch (e) {
    console.error('❌ Failed to check settings:', e.message);
    results.settings.status = '❌';
  }
  
  // Check 2: Python server
  console.log('\n2️⃣ Checking Python Server...');
  try {
    const serverCheck = await window.electronAPI.invoke('diagnostic:check-server');
    results.server.status = serverCheck.running ? '✅' : '❌';
    results.server.details = serverCheck;
    
    console.log(serverCheck.running ? '✅ Server is running' : '❌ Server is not running');
    console.log('   Port:', serverCheck.port);
    console.log('   Python path:', serverCheck.pythonPath);
  } catch (e) {
    console.error('❌ Failed to check server:', e.message);
    results.server.status = '❌';
  }
  
  // Check 3: Environment variables
  console.log('\n3️⃣ Checking Environment Variables...');
  try {
    const envCheck = await window.electronAPI.invoke('diagnostic:check-env');
    results.environment.status = '✅';
    results.environment.details = envCheck;
    
    console.log('   OPENROUTER_API_KEY:', envCheck.OPENROUTER_API_KEY ? '✅ Set' : '❌ Not set');
    console.log('   OPENAI_API_KEY:', envCheck.OPENAI_API_KEY ? '✅ Set' : '❌ Not set');
    console.log('   DEEPGRAM_API_KEY:', envCheck.DEEPGRAM_API_KEY ? '✅ Set' : '❌ Not set');
    console.log('   DEFAULT_LLM:', envCheck.DEFAULT_LLM || 'not set');
    console.log('   USE_STREAMING_TRANSCRIPTION:', envCheck.USE_STREAMING_TRANSCRIPTION || 'not set');
  } catch (e) {
    console.error('❌ Failed to check environment:', e.message);
    results.environment.status = '❌';
  }
  
  // Check 4: API key validation
  console.log('\n4️⃣ Validating API Keys...');
  const hasAIKey = results.environment.details.OPENROUTER_API_KEY || 
                   results.environment.details.OPENAI_API_KEY;
  const hasTranscriptionKey = results.environment.details.DEEPGRAM_API_KEY || 
                              results.environment.details.ASSEMBLYAI_API_KEY;
  
  if (hasAIKey) {
    console.log('✅ At least one AI provider API key is configured');
    results.apiKeys.status = '✅';
  } else {
    console.log('❌ No AI provider API keys found');
    results.apiKeys.status = '❌';
  }
  
  if (hasTranscriptionKey) {
    console.log('✅ At least one transcription API key is configured');
  } else {
    console.log('⚠️  No transcription API keys found (will use local Whisper)');
  }
  
  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Diagnostic Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Settings File: ${results.settings.status}`);
  console.log(`Python Server: ${results.server.status}`);
  console.log(`Environment: ${results.environment.status}`);
  console.log(`API Keys: ${results.apiKeys.status}`);
  
  const allGood = Object.values(results).every(r => r.status === '✅');
  
  if (allGood) {
    console.log('\n🎉 All checks passed! Your configuration is correct.');
  } else {
    console.log('\n⚠️  Some checks failed. Please review the issues above.');
    console.log('\n💡 Quick Fixes:');
    
    if (results.settings.status === '❌') {
      console.log('   • Settings file not found - Open Settings and save your API keys');
    }
    
    if (results.server.status === '❌') {
      console.log('   • Server not running - Check if Python is installed');
      console.log('   • Try restarting the application');
    }
    
    if (results.apiKeys.status === '❌') {
      console.log('   • No API keys configured - Add keys in Settings:');
      console.log('     - OpenRouter: https://openrouter.ai/keys');
      console.log('     - OpenAI: https://platform.openai.com/api-keys');
      console.log('     - Deepgram: https://console.deepgram.com/');
    }
  }
  
  console.log('\n📖 For more help, see: PACKAGED_APP_SETUP.md');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  return results;
}

// Auto-run on load
console.log('💡 To run diagnostics, type: runDiagnostics()');
