# ============================================
# Backend Connection Test Script
# Tests local and cloud backend connectivity
# ============================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "BACKEND CONNECTION TEST" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: Check if local Python server is running
Write-Host "[TEST 1] Checking Local Python Server..." -ForegroundColor Yellow
$localServerRunning = $false
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $tcpClient.Connect("localhost", 8765)
    $tcpClient.Close()
    Write-Host "✅ Local server is running on port 8765" -ForegroundColor Green
    $localServerRunning = $true
} catch {
    Write-Host "❌ Local server is NOT running on port 8765" -ForegroundColor Red
    Write-Host "   Run: python python/server.py" -ForegroundColor Gray
}

# Test 2: Check cloud backend connectivity
Write-Host "`n[TEST 2] Checking Cloud Backend (api.interviewai.space)..." -ForegroundColor Yellow
try {
    # Test HTTPS endpoint first
    $response = Invoke-WebRequest -Uri "https://api.interviewai.space/health" -Method GET -TimeoutSec 10 -ErrorAction Stop
    Write-Host "✅ Cloud backend is responding (HTTPS)" -ForegroundColor Green
    Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Cloud backend HTTPS check failed" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
}

# Test 3: WebSocket connectivity test
Write-Host "`n[TEST 3] Testing WebSocket Connection..." -ForegroundColor Yellow

# Create a simple WebSocket test script
$wsTestScript = @'
const WebSocket = require('ws');

// Test local WebSocket
console.log('\n[WS TEST] Testing local WebSocket (ws://localhost:8765)...');
const wsLocal = new WebSocket('ws://localhost:8765');

wsLocal.on('open', () => {
    console.log('✅ Local WebSocket connected');
    wsLocal.close();
    testCloud();
});

wsLocal.on('error', (err) => {
    console.log('❌ Local WebSocket failed:', err.message);
    testCloud();
});

// Test cloud WebSocket
function testCloud() {
    console.log('\n[WS TEST] Testing cloud WebSocket (wss://api.interviewai.space)...');
    const wsCloud = new WebSocket('wss://api.interviewai.space');
    
    wsCloud.on('open', () => {
        console.log('✅ Cloud WebSocket connected');
        wsCloud.close();
        process.exit(0);
    });
    
    wsCloud.on('error', (err) => {
        console.log('❌ Cloud WebSocket failed:', err.message);
        process.exit(1);
    });
    
    setTimeout(() => {
        console.log('⚠️ Cloud WebSocket timeout');
        process.exit(1);
    }, 10000);
}

setTimeout(() => {
    console.log('⚠️ Local WebSocket timeout');
    testCloud();
}, 5000);
'@

# Save the test script
$wsTestPath = Join-Path $PSScriptRoot "ws-test-temp.js"
$wsTestScript | Out-File -FilePath $wsTestPath -Encoding UTF8

# Run the WebSocket test
try {
    node $wsTestPath
} catch {
    Write-Host "❌ WebSocket test failed to run" -ForegroundColor Red
}

# Cleanup
Remove-Item $wsTestPath -ErrorAction SilentlyContinue

# Test 4: Check environment configuration
Write-Host "`n[TEST 4] Checking Environment Configuration..." -ForegroundColor Yellow

# Check .env file
if (Test-Path ".env") {
    Write-Host "✅ .env file exists" -ForegroundColor Green
    
    # Check for critical API keys
    $envContent = Get-Content ".env" -Raw
    
    if ($envContent -match "OPENROUTER_API_KEY=sk-") {
        Write-Host "✅ OPENROUTER_API_KEY is set" -ForegroundColor Green
    } else {
        Write-Host "❌ OPENROUTER_API_KEY is missing or invalid" -ForegroundColor Red
    }
    
    if ($envContent -match "DEEPGRAM_API_KEY=") {
        Write-Host "✅ DEEPGRAM_API_KEY is set" -ForegroundColor Green
    } else {
        Write-Host "⚠️ DEEPGRAM_API_KEY is missing (optional)" -ForegroundColor Yellow
    }
    
    if ($envContent -match "USE_STREAMING_TRANSCRIPTION=true") {
        Write-Host "✅ Streaming transcription is enabled" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Streaming transcription is disabled" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ .env file not found" -ForegroundColor Red
}

# Test 5: Check desktop app configuration
Write-Host "`n[TEST 5] Checking Desktop App Configuration..." -ForegroundColor Yellow

if (Test-Path "electron/config.js") {
    $configContent = Get-Content "electron/config.js" -Raw
    
    # Check production server URL
    if ($configContent -match "serverUrl.*wss://api\.interviewai\.space") {
        Write-Host "✅ Production server URL configured correctly" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Production server URL may need updating" -ForegroundColor Yellow
    }
    
    # Check if cloud mode is enabled in production
    if ($configContent -match "cloudMode:\s*true") {
        Write-Host "✅ Cloud mode is enabled for production" -ForegroundColor Green
    } else {
        Write-Host "❌ Cloud mode is not enabled" -ForegroundColor Red
    }
} else {
    Write-Host "❌ electron/config.js not found" -ForegroundColor Red
}

# Test 6: Check Python server file
Write-Host "`n[TEST 6] Checking Python Server Setup..." -ForegroundColor Yellow

if (Test-Path "python/server.py") {
    Write-Host "✅ Python server file exists" -ForegroundColor Green
    
    # Check if required Python packages are installed
    $pythonCheck = python -c "import websockets, numpy; print('ok')" 2>$null
    if ($pythonCheck -eq "ok") {
        Write-Host "✅ Required Python packages are installed" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Some Python packages may be missing" -ForegroundColor Yellow
        Write-Host "   Run: pip install -r requirements.txt" -ForegroundColor Gray
    }
} else {
    Write-Host "❌ python/server.py not found" -ForegroundColor Red
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`nRecommendations:" -ForegroundColor White

if (!$localServerRunning) {
    Write-Host "• Start local server: python python/server.py" -ForegroundColor Yellow
}

Write-Host "`nTo test desktop app:" -ForegroundColor White
Write-Host "  1. Development mode: npm run electron" -ForegroundColor Gray
Write-Host "  2. Production mode: set NODE_ENV=production && npm run electron" -ForegroundColor Gray

Write-Host "`nCloud backend URL: wss://api.interviewai.space" -ForegroundColor Cyan
Write-Host "Local backend URL: ws://localhost:8765" -ForegroundColor Cyan

Write-Host "`n========================================`n" -ForegroundColor Cyan
