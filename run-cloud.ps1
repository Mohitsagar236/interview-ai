# ============================================
# Run Desktop App with CLOUD Backend
# ============================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "STARTING DESKTOP APP (CLOUD MODE)" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Backend URL: wss://api.interviewai.space" -ForegroundColor Green
Write-Host "  Mode: Development (with DevTools)" -ForegroundColor Green
Write-Host "  Local Server: Disabled" -ForegroundColor Green
Write-Host "`n"

# Ensure we're NOT using local server
$env:USE_LOCAL_SERVER = "false"

# Run electron app
Write-Host "Starting Electron app..." -ForegroundColor Yellow
npm start

Write-Host "`n========================================`n" -ForegroundColor Cyan
