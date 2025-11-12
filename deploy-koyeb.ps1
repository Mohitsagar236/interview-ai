# Deploy to Koyeb - Automated Script
# This script helps deploy the backend to Koyeb

Write-Host "🚀 Interview AI - Koyeb Deployment Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if git is clean
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "⚠️  You have uncommitted changes:" -ForegroundColor Yellow
    Write-Host $gitStatus
    Write-Host ""
    $commit = Read-Host "Do you want to commit and push these changes? (y/n)"
    
    if ($commit -eq 'y') {
        Write-Host "📝 Committing changes..." -ForegroundColor Green
        git add .
        git commit -m "Deploy backend to Koyeb with updated configuration"
        
        Write-Host "📤 Pushing to GitHub..." -ForegroundColor Green
        git push origin main
        
        Write-Host "✅ Changes pushed to GitHub!" -ForegroundColor Green
        Write-Host "Koyeb will automatically detect and deploy the changes." -ForegroundColor Green
    } else {
        Write-Host "❌ Deployment cancelled. Please commit your changes first." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ Git repository is clean" -ForegroundColor Green
}

Write-Host ""
Write-Host "📋 Deployment Checklist:" -ForegroundColor Cyan
Write-Host "------------------------" -ForegroundColor Cyan
Write-Host ""

$checklist = @(
    "Koyeb account created",
    "GitHub repository connected to Koyeb",
    "Service created with name: interview-ai-backend",
    "Docker build configured",
    "Port 8000 configured",
    "Environment variables added",
    "API keys configured (OpenRouter, Deepgram)"
)

foreach ($item in $checklist) {
    $response = Read-Host "✓ $item ? (y/n)"
    if ($response -ne 'y') {
        Write-Host "❌ Please complete: $item" -ForegroundColor Red
        Write-Host ""
        Write-Host "📖 See KOYEB_DEPLOYMENT_INSTRUCTIONS.md for detailed steps" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""
Write-Host "🎉 All checks passed!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Next Steps:" -ForegroundColor Cyan
Write-Host "-------------" -ForegroundColor Cyan
Write-Host "1. Go to Koyeb dashboard: https://app.koyeb.com" -ForegroundColor White
Write-Host "2. Check deployment status" -ForegroundColor White
Write-Host "3. Wait for deployment to complete (3-5 minutes)" -ForegroundColor White
Write-Host "4. Test health endpoint: https://interview-ai-backend-mohitsagar236.koyeb.app/health" -ForegroundColor White
Write-Host "5. Test WebSocket: node test-cloud-ws.js" -ForegroundColor White
Write-Host "6. Test desktop app: npm run dev" -ForegroundColor White
Write-Host ""

$openBrowser = Read-Host "Open Koyeb dashboard in browser? (y/n)"
if ($openBrowser -eq 'y') {
    Start-Process "https://app.koyeb.com"
}

Write-Host ""
Write-Host "✅ Deployment script completed!" -ForegroundColor Green
Write-Host "📖 For troubleshooting, see KOYEB_DEPLOYMENT_INSTRUCTIONS.md" -ForegroundColor Yellow
