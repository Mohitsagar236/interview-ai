# Interview AI Desktop App Startup Script
# This script ensures the Python backend is running before starting the Electron app

Write-Host "Starting Interview AI Desktop App..." -ForegroundColor Green
Write-Host ""

# Check if .venv exists
if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
    Write-Host "ERROR: Python virtual environment not found!" -ForegroundColor Red
    Write-Host "   Run: npm run setup:py" -ForegroundColor Yellow
    exit 1
}

# Check if backend is already running
Write-Host "Checking if backend is already running..." -ForegroundColor Cyan
$pythonProcess = Get-Process -Name "python*" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*interview-ai*" }

if ($pythonProcess) {
    Write-Host "Backend is already running (PID: $($pythonProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "Backend not running. Starting it now..." -ForegroundColor Yellow

    # Start backend in background
    Start-Process -FilePath ".\.venv\Scripts\python.exe" -ArgumentList ".\python\server.py" -NoNewWindow -PassThru

    Write-Host "Waiting for backend to start (3 seconds)..." -ForegroundColor Cyan
    Start-Sleep -Seconds 3

    # Verify it started
    $pythonProcess = Get-Process -Name "python*" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*interview-ai*" }
    if ($pythonProcess) {
        Write-Host "Backend started successfully!" -ForegroundColor Green
    } else {
        Write-Host "Could not verify backend startup, but continuing..." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Starting Electron app..." -ForegroundColor Cyan

# Set environment variable to use local server
$env:USE_LOCAL_SERVER = "true"
$env:NODE_ENV = "development"

# Start Electron
npm start
