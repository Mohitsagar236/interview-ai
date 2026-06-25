# Interview AI Desktop App Startup Script
# This script starts the Electron app. Electron main starts the Python backend.

Write-Host "Starting Interview AI Desktop App..." -ForegroundColor Green
Write-Host ""

Write-Host "Starting Electron app..." -ForegroundColor Cyan

# Set environment variable to use local server
$env:USE_LOCAL_SERVER = "true"
$env:NODE_ENV = "development"

# Start Electron. Use npm.cmd on Windows to avoid PowerShell execution policy blocking npm.ps1.
npm.cmd start
