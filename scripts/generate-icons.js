const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
const svgPath = path.join(assetsDir, 'icon.svg');

console.log('Generating Windows application icons...');

async function generateIcons() {
  try {
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    const svgBuffer = fs.readFileSync(svgPath);
    const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];

    await Promise.all(sizes.map(size =>
      sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(path.join(assetsDir, `icon-${size}.png`))
        .then(() => console.log(`  Generated icon-${size}.png`))
    ));

    await sharp(svgBuffer)
      .resize(1024, 1024)
      .png()
      .toFile(path.join(assetsDir, 'icon.png'));
    console.log('  Generated icon.png');

    const toIco = require('to-ico');
    const icoBuffers = await Promise.all([256, 128, 64, 48, 32, 16].map(size =>
      sharp(svgBuffer).resize(size, size).png().toBuffer()
    ));

    fs.writeFileSync(path.join(assetsDir, 'icon.ico'), await toIco(icoBuffers));
    console.log('  Generated icon.ico');

    console.log('\nIcons generated successfully.');
  } catch (error) {
    console.error('Icon generation failed:', error.message);
    process.exit(1);
  }
}

generateIcons();
