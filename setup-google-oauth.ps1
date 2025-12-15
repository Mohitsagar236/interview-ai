# Google OAuth Quick Setup Script
# Run this to verify your Google OAuth configuration

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Google OAuth Setup Verification" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env file exists
if (Test-Path ".env") {
    Write-Host "✅ .env file found" -ForegroundColor Green
    
    # Check for Supabase configuration
    $envContent = Get-Content ".env" -Raw
    
    if ($envContent -match "SUPABASE_URL=") {
        Write-Host "✅ SUPABASE_URL configured" -ForegroundColor Green
    } else {
        Write-Host "❌ SUPABASE_URL not found in .env" -ForegroundColor Red
    }
    
    if ($envContent -match "SUPABASE_ANON_KEY=") {
        Write-Host "✅ SUPABASE_ANON_KEY configured" -ForegroundColor Green
    } else {
        Write-Host "❌ SUPABASE_ANON_KEY not found in .env" -ForegroundColor Red
    }
} else {
    Write-Host "❌ .env file not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. ⚙️  Setup Google OAuth credentials" -ForegroundColor White
Write-Host "   → https://console.cloud.google.com/" -ForegroundColor Gray
Write-Host ""
Write-Host "2. 🔧 Configure Supabase Google provider" -ForegroundColor White
Write-Host "   → https://app.supabase.com/project/npdysfxewryqcmmztdxl/auth/providers" -ForegroundColor Gray
Write-Host ""
Write-Host "3. ✅ Add redirect URLs:" -ForegroundColor White
Write-Host "   → Google Console: https://npdysfxewryqcmmztdxl.supabase.co/auth/v1/callback" -ForegroundColor Gray
Write-Host "   → Supabase: http://localhost:3000/auth.html" -ForegroundColor Gray
Write-Host ""
Write-Host "4. 🧪 Test the integration:" -ForegroundColor White
Write-Host "   → Run: npm run dev (or python local-dev-server.js)" -ForegroundColor Gray
Write-Host "   → Open: http://localhost:3000/test-google-oauth.html" -ForegroundColor Gray
Write-Host ""
Write-Host "📖 Full documentation: GOOGLE_OAUTH_SETUP.md" -ForegroundColor Cyan
Write-Host ""

# Offer to open documentation
$openDocs = Read-Host "Open setup guide? (y/n)"
if ($openDocs -eq "y") {
    if (Test-Path "GOOGLE_OAUTH_SETUP.md") {
        Start-Process "GOOGLE_OAUTH_SETUP.md"
    } else {
        Write-Host "❌ Setup guide not found" -ForegroundColor Red
    }
}

# Offer to open test page
Write-Host ""
$startServer = Read-Host "Start development server and open test page? (y/n)"
if ($startServer -eq "y") {
    Write-Host ""
    Write-Host "Starting server..." -ForegroundColor Green
    
    # Check if node_modules exists
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing dependencies..." -ForegroundColor Yellow
        npm install
    }
    
    # Start the server and open browser
    Write-Host "Opening test page in browser..." -ForegroundColor Green
    Start-Process "http://localhost:3000/test-google-oauth.html"
    
    # Start server (choose appropriate command)
    if (Test-Path "local-dev-server.js") {
        node local-dev-server.js
    } elseif (Test-Path "package.json") {
        npm run dev
    } else {
        Write-Host "❌ Could not find server start script" -ForegroundColor Red
    }
}
