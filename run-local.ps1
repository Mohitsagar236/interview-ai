# ============================================
# Run Desktop App with LOCAL Backend (Optional)
# Use this only if you need to test with local server
# ============================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "STARTING DESKTOP APP (LOCAL MODE)" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Backend URL: ws://localhost:8765" -ForegroundColor Green
Write-Host "  Mode: Development" -ForegroundColor Green
Write-Host "  Local Server: Enabled" -ForegroundColor Green
Write-Host "`n"

# Enable local server mode
$env:USE_LOCAL_SERVER = "true"

Write-Host "⚠️  Make sure Python server is running!" -ForegroundColor Yellow
Write-Host "   Run: python python/server.py`n" -ForegroundColor Gray

# Run electron app
Write-Host "Starting Electron app..." -ForegroundColor Yellow
npm start

Write-Host "`n========================================`n" -ForegroundColor Cyan
