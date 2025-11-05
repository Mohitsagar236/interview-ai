const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const assetsDir = path.join(__dirname, '..', 'assets');
const svgPath = path.join(assetsDir, 'icon.svg');

console.log('🎨 Generating application icons...');

async function generateIcons() {
  try {
    // Ensure assets directory exists
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    // Read SVG file
    const svgBuffer = fs.readFileSync(svgPath);

    console.log('📱 Generating PNG icons...');
    
    // Generate PNG at different sizes
    const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
    const pngPromises = sizes.map(size => 
      sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(path.join(assetsDir, `icon-${size}.png`))
        .then(() => console.log(`  ✓ Generated ${size}x${size} PNG`))
    );

    await Promise.all(pngPromises);

    // Generate main icon.png (1024x1024 for Linux)
    console.log('🐧 Generating Linux icon...');
    await sharp(svgBuffer)
      .resize(1024, 1024)
      .png()
      .toFile(path.join(assetsDir, 'icon.png'));
    console.log('  ✓ Generated icon.png (1024x1024)');

    // Generate Windows ICO using to-ico (proper ICO format)
    console.log('🪟 Generating Windows ICO...');
    try {
      const toIco = require('to-ico');
      
      // Read PNG buffers for ICO generation
      const pngBuffers = await Promise.all([
        sharp(svgBuffer).resize(256, 256).png().toBuffer(),
        sharp(svgBuffer).resize(128, 128).png().toBuffer(),
        sharp(svgBuffer).resize(64, 64).png().toBuffer(),
        sharp(svgBuffer).resize(48, 48).png().toBuffer(),
        sharp(svgBuffer).resize(32, 32).png().toBuffer(),
        sharp(svgBuffer).resize(16, 16).png().toBuffer()
      ]);

      const icoBuffer = await toIco(pngBuffers);
      fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);
      console.log('  ✓ Generated icon.ico (multi-resolution: 256,128,64,48,32,16)');
    } catch (icoError) {
      console.error('  ❌ Failed to generate ICO:', icoError.message);
      throw new Error('ICO generation failed. Please ensure to-ico package is installed.');
    }

    // Generate macOS ICNS
    console.log('🍎 Generating macOS ICNS...');
    
    // Create temporary iconset folder
    const iconsetPath = path.join(assetsDir, 'icon.iconset');
    if (!fs.existsSync(iconsetPath)) {
      fs.mkdirSync(iconsetPath);
    }

    // Generate required sizes for macOS iconset
    const macSizes = [
      { size: 16, name: 'icon_16x16.png' },
      { size: 32, name: 'icon_16x16@2x.png' },
      { size: 32, name: 'icon_32x32.png' },
      { size: 64, name: 'icon_32x32@2x.png' },
      { size: 128, name: 'icon_128x128.png' },
      { size: 256, name: 'icon_128x128@2x.png' },
      { size: 256, name: 'icon_256x256.png' },
      { size: 512, name: 'icon_256x256@2x.png' },
      { size: 512, name: 'icon_512x512.png' },
      { size: 1024, name: 'icon_512x512@2x.png' }
    ];

    const macPromises = macSizes.map(({ size, name }) =>
      sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(path.join(iconsetPath, name))
    );

    await Promise.all(macPromises);

    // Try to create ICNS file using iconutil (macOS only)
    if (process.platform === 'darwin') {
      try {
        execSync(`iconutil -c icns "${iconsetPath}" -o "${path.join(assetsDir, 'icon.icns')}"`);
        console.log('  ✓ Generated icon.icns (using iconutil)');
      } catch (err) {
        console.log('  ⚠️  iconutil not available, creating fallback ICNS');
        // Keep iconset folder for manual conversion or electron-builder will handle it
        console.log('  ℹ️  electron-builder will use icon.iconset automatically on macOS');
      }
    } else {
      console.log('  ℹ️  ICNS generation requires macOS. electron-builder will handle this during build.');
      console.log('  ℹ️  Created icon.iconset folder for electron-builder');
    }

    // Clean up temporary PNG files used for ICO
    if (fs.existsSync(path.join(assetsDir, 'icon-256-for-ico.png'))) {
      fs.unlinkSync(path.join(assetsDir, 'icon-256-for-ico.png'));
    }

    console.log('\n✅ All icons generated successfully!');
    console.log('\nGenerated files:');
    console.log('  📁 assets/icon.png (1024x1024) - Linux');
    console.log('  📁 assets/icon.ico (multi-resolution) - Windows');
    console.log('  📁 assets/icon.iconset/ - macOS (electron-builder will convert)');
    console.log('  📁 assets/icon-*.png - Various sizes for reference');

  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
