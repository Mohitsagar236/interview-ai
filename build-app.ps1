# Build Desktop App and Update Download Links
# Run this script to build the app and automatically update download.js

Write-Host "🚀 Building Interview AI Desktop App..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if dist directory exists, create if not
if (!(Test-Path "dist")) {
    New-Item -ItemType Directory -Path "dist" -Force | Out-Null
}

# Step 2: Build the application
Write-Host "📦 Building Windows installer..." -ForegroundColor Yellow
npm run build:prod

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build completed successfully!" -ForegroundColor Green
Write-Host ""

# Step 3: Check for built files
$exeFile = Get-ChildItem -Path "dist" -Filter "*.exe" | Select-Object -First 1

if ($exeFile) {
    Write-Host "📁 Built file found: $($exeFile.Name)" -ForegroundColor Green
    Write-Host "📊 File size: $([math]::Round($exeFile.Length / 1MB, 2)) MB" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "⚠️  No .exe file found in dist folder" -ForegroundColor Yellow
}

# Step 4: Instructions for next steps
Write-Host "================================" -ForegroundColor Cyan
Write-Host "🎯 Next Steps:" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1️⃣  Upload to GitHub Releases:" -ForegroundColor Yellow
Write-Host "   → Go to: https://github.com/Mohitsagar236/interview-ai/releases" -ForegroundColor White
Write-Host "   → Click 'Create a new release'" -ForegroundColor White
Write-Host "   → Tag version: v0.1.0" -ForegroundColor White
Write-Host "   → Upload file: $($exeFile.Name)" -ForegroundColor White
Write-Host ""
Write-Host "2️⃣  After uploading, copy the download URL" -ForegroundColor Yellow
Write-Host ""
Write-Host "3️⃣  Update download.js with the URL:" -ForegroundColor Yellow
Write-Host "   → Edit: public/download.js" -ForegroundColor White
Write-Host "   → Update DOWNLOAD_URLS.windows" -ForegroundColor White
Write-Host ""
Write-Host "4️⃣  Commit and deploy:" -ForegroundColor Yellow
Write-Host "   git add ." -ForegroundColor White
Write-Host "   git commit -m 'Update desktop app download link'" -ForegroundColor White
Write-Host "   git push origin main" -ForegroundColor White
Write-Host ""

# Optional: Open dist folder
Write-Host "Press Enter to open the dist folder, or Ctrl+C to exit..." -ForegroundColor Cyan
Read-Host
Start-Process "explorer.exe" -ArgumentList (Resolve-Path "dist")
