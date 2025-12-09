const { put } = require('@vercel/blob');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function uploadLatestBuilds() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  
  if (!token) {
    console.error('❌ BLOB_READ_WRITE_TOKEN not found in .env');
    process.exit(1);
  }

  const distDir = path.join(__dirname, '..', 'dist');
  const files = fs.readdirSync(distDir)
    .filter(f => f.startsWith('Interview-AI-Setup-LATEST-') && f.endsWith('.exe'))
    .map(f => path.join(distDir, f));

  if (files.length === 0) {
    console.error('❌ No LATEST build files found');
    process.exit(1);
  }

  console.log(`Found ${files.length} files to upload:\n`);

  const urls = {};

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    console.log(`📤 Uploading ${fileName}...`);
    
    const fileBuffer = fs.readFileSync(filePath);
    const blob = await put(fileName, fileBuffer, {
      access: 'public',
      token: token,
      addRandomSuffix: false,
    });

    console.log(`✅ Uploaded: ${blob.url}\n`);
    urls[fileName] = blob.url;
  }

  console.log('📋 Download URLs:');
  console.log(JSON.stringify(urls, null, 2));
  console.log('\n🎯 Use the x64 URL to download the latest version with PaddleOCR!');
}

uploadLatestBuilds().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
