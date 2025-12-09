/**
 * Clean up old builds and upload new ones to Vercel Blob Storage
 * Usage: node scripts/update-blob.js
 */

require('dotenv').config();
const { put, list, del } = require('@vercel/blob');
const fs = require('fs');
const path = require('path');

async function cleanupAndUpload() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  
  if (!token) {
    console.error('❌ Error: BLOB_READ_WRITE_TOKEN environment variable not set');
    process.exit(1);
  }

  console.log('🧹 Step 1: Cleaning up old builds...\n');
  
  // List all blobs
  const { blobs } = await list({ token });
  console.log(`Found ${blobs.length} existing files\n`);

  // Delete all old builds (keep only space for new ones)
  for (const blob of blobs) {
    console.log(`Deleting: ${blob.pathname}`);
    await del(blob.url, { token });
  }
  
  console.log('\n✅ Cleanup complete!\n');

  console.log('📤 Step 2: Uploading new builds...\n');

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
        const fileName = path.basename(filePath);
        const fileBuffer = fs.readFileSync(filePath);
        
        console.log(`📤 Uploading ${fileName}...`);
        
        const blob = await put(fileName, fileBuffer, {
          access: 'public',
          token: token,
        });
        
        console.log(`✅ Uploaded: ${blob.url}\n`);
        urls[installer] = blob.url;
      } catch (error) {
        console.error(`❌ Failed to upload ${installer}:`, error.message);
      }
    } else {
      console.warn(`⚠️  File not found: ${installer}`);
    }
  }
  
  console.log('\n✅ All done!\n');
  console.log('📋 Download URLs:');
  console.log(JSON.stringify(urls, null, 2));
  console.log('\n💡 Update api/download.js with these URLs if needed');
}

cleanupAndUpload().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
