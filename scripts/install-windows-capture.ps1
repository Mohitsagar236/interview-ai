# Install Windows Native Capture Support
# This script installs pywin32 for capturing restricted applications

Write-Host "🔧 Installing Windows Native Capture Support..." -ForegroundColor Cyan
Write-Host ""

# Check if virtual environment is activated
$venvPath = ".\.venv\Scripts\Activate.ps1"
if (Test-Path $venvPath) {
    Write-Host "✅ Virtual environment found" -ForegroundColor Green
    
    # Activate if not already activated
    if (-not $env:VIRTUAL_ENV) {
        Write-Host "🔄 Activating virtual environment..." -ForegroundColor Yellow
        & $venvPath
    }
} else {
    Write-Host "⚠️  No virtual environment found. Installing globally..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📦 Installing pywin32..." -ForegroundColor Cyan

# Install pywin32
pip install pywin32

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Installation successful!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Windows native capture is now available." -ForegroundColor Green
    Write-Host "This allows capturing restricted applications like:" -ForegroundColor Gray
    Write-Host "  • DRM-protected video players (Netflix, Disney+)" -ForegroundColor Gray
    Write-Host "  • Protected game clients" -ForegroundColor Gray
    Write-Host "  • Banking/financial applications" -ForegroundColor Gray
    Write-Host "  • Virtual machines and remote desktop" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To verify, restart the server and look for:" -ForegroundColor Cyan
    Write-Host "  '✅ Windows native capture available'" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Installation failed!" -ForegroundColor Red
    Write-Host "Try running as administrator or check your internet connection." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "Press any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
