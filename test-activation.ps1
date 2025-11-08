# Test Activation Code Script
# Run this to test if your activation code works with the API

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Desktop Activation Code Tester" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Get activation code from user
Write-Host "Enter your activation code (from interviewai.space/profile.html):" -ForegroundColor Yellow
$activationCode = Read-Host

# Remove spaces and convert to uppercase
$normalizedCode = $activationCode.Replace(" ", "").Replace("-", "").ToUpper()
$formattedCode = ""
for ($i = 0; $i -lt $normalizedCode.Length; $i++) {
    if ($i -gt 0 -and $i % 4 -eq 0) {
        $formattedCode += "-"
    }
    $formattedCode += $normalizedCode[$i]
}

Write-Host ""
Write-Host "Testing code: $formattedCode" -ForegroundColor White
Write-Host ""

# Test the API
$body = @{
    code = $formattedCode
    deviceInfo = @{
        platform = "win32"
        hostname = $env:COMPUTERNAME
    }
} | ConvertTo-Json

try {
    Write-Host "Sending request to API..." -ForegroundColor Gray
    
    $response = Invoke-RestMethod -Uri "https://interviewai.space/api/activation?action=activate" `
        -Method POST `
        -Headers @{"Content-Type"="application/json"} `
        -Body $body `
        -ErrorAction Stop
    
    Write-Host ""
    Write-Host "✅ SUCCESS!" -ForegroundColor Green
    Write-Host ""
    Write-Host "User: $($response.user.email)" -ForegroundColor White
    Write-Host "Credits Total: $($response.credits.total)" -ForegroundColor White
    Write-Host "Credits Used: $($response.credits.used)" -ForegroundColor White
    Write-Host "Credits Remaining: $($response.credits.remaining)" -ForegroundColor Cyan
    Write-Host "Plan: $($response.planType)" -ForegroundColor White
    Write-Host ""
    Write-Host "🎉 Your activation code works! The desktop app should activate successfully." -ForegroundColor Green
    
} catch {
    Write-Host ""
    Write-Host "❌ ACTIVATION FAILED" -ForegroundColor Red
    Write-Host ""
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
        
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        $errorJson = $errorBody | ConvertFrom-Json
        
        Write-Host "Error: $($errorJson.error)" -ForegroundColor Yellow
        if ($errorJson.details) {
            Write-Host "Details: $($errorJson.details)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Cyan
    Write-Host "1. Go to https://interviewai.space/profile.html" -ForegroundColor White
    Write-Host "2. Log in to your account" -ForegroundColor White
    Write-Host "3. Generate a new activation code" -ForegroundColor White
    Write-Host "4. Make sure you have credits > 0" -ForegroundColor White
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
