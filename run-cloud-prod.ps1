# ============================================
# Run Desktop App with CLOUD Backend (Production Mode)
# ============================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "STARTING DESKTOP APP (CLOUD PRODUCTION)" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Backend URL: wss://api.interviewai.space" -ForegroundColor Green
Write-Host "  Mode: Production (no DevTools)" -ForegroundColor Green
Write-Host "  Local Server: Disabled" -ForegroundColor Green
Write-Host "`n"

# Set production environment
$env:NODE_ENV = "production"

# Run electron app
Write-Host "Starting Electron app in production mode..." -ForegroundColor Yellow
npm start

Write-Host "`n========================================`n" -ForegroundColor Cyan
