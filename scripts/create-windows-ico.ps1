# PowerShell script to create proper Windows ICO from PNG files
# This creates a multi-resolution ICO file for Windows

$assetsPath = Join-Path $PSScriptRoot "..\assets"
$outputIco = Join-Path $assetsPath "icon.ico"

Write-Host "🪟 Creating Windows ICO file..." -ForegroundColor Cyan

# Check if we have ImageMagick installed
try {
    $magickPath = (Get-Command magick -ErrorAction Stop).Source
    Write-Host "  ✓ Found ImageMagick at: $magickPath" -ForegroundColor Green
    
    # Create ICO with multiple resolutions using ImageMagick
    $pngFiles = @(
        Join-Path $assetsPath "icon-16.png"
        Join-Path $assetsPath "icon-32.png"
        Join-Path $assetsPath "icon-48.png"
        Join-Path $assetsPath "icon-64.png"
        Join-Path $assetsPath "icon-128.png"
        Join-Path $assetsPath "icon-256.png"
    )
    
    # Convert to ICO
    & magick convert $pngFiles $outputIco
    
    if (Test-Path $outputIco) {
        Write-Host "  ✓ Created multi-resolution icon.ico" -ForegroundColor Green
        $size = (Get-Item $outputIco).Length / 1KB
        Write-Host "  ℹ️  File size: $([math]::Round($size, 2)) KB" -ForegroundColor Gray
    }
    
} catch {
    Write-Host "  ⚠️  ImageMagick not found. Using fallback method..." -ForegroundColor Yellow
    Write-Host "  ℹ️  electron-builder will handle ICO conversion" -ForegroundColor Gray
    
    # Fallback: Copy 256x256 PNG as ICO
    # electron-builder will convert it properly during build
    $png256 = Join-Path $assetsPath "icon-256.png"
    Copy-Item $png256 $outputIco -Force
    Write-Host "  ✓ Created icon.ico from 256x256 PNG" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Icon setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Generated icons in assets/:" -ForegroundColor Cyan
Write-Host "  • icon.ico - Windows installer icon" -ForegroundColor White
Write-Host "  • icon.png - Linux AppImage icon (1024x1024)" -ForegroundColor White
Write-Host "  • icon.iconset/ - macOS ICNS source (for Mac builds)" -ForegroundColor White
Write-Host ""
Write-Host "Ready to build with: npm run build:prod" -ForegroundColor Green
