/**
 * Upload desktop installers to Vercel Blob Storage
 * Usage: node scripts/upload-to-blob.js
 */

require('dotenv').config();
const { put } = require('@vercel/blob');
const fs = require('fs');
const path = require('path');

async function uploadInstaller(filePath, token) {
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  
  console.log(`📤 Uploading ${fileName}...`);
  
  const blob = await put(fileName, fileBuffer, {
    access: 'public',
    token: token,
  });
  
  console.log(`✅ Uploaded: ${blob.url}`);
  return blob.url;
}

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  
  if (!token) {
    console.error('❌ Error: BLOB_READ_WRITE_TOKEN environment variable not set');
    console.log('\nTo get your token:');
    console.log('1. Go to https://vercel.com/dashboard/stores');
    console.log('2. Create a new Blob Store (free tier: 100GB/month)');
    console.log('3. Copy the BLOB_READ_WRITE_TOKEN');
    console.log('4. Add it to your .env file');
    process.exit(1);
  }
  
  const distDir = path.join(__dirname, '..', 'dist');
  const installers = [
    'Interview-AI-Setup-0.1.0-x64.exe',
    'Interview-AI-Setup-0.1.0-ia32.exe'
  ];
  
  const urls = {};
  
  for (const installer of installers) {
    const filePath = path.join(distDir, installer);
    if (fs.existsSync(filePath)) {
      try {
        const url = await uploadInstaller(filePath, token);
        urls[installer] = url;
      } catch (error) {
        console.error(`❌ Failed to upload ${installer}:`, error.message);
      }
    } else {
      console.warn(`⚠️  File not found: ${installer}`);
    }
  }
  
  console.log('\n📋 Update api/download.js with these URLs:');
  console.log(JSON.stringify(urls, null, 2));
}

main().catch(console.error);
