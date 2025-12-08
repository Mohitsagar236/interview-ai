const { list, del } = require('@vercel/blob');
require('dotenv').config();

async function cleanupOldBuilds() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  
  if (!token) {
    console.error('❌ BLOB_READ_WRITE_TOKEN not found in .env');
    process.exit(1);
  }

  console.log('📋 Listing all blobs...\n');
  const { blobs } = await list({ token });

  console.log(`Found ${blobs.length} files:\n`);
  
  // Show all files with size
  blobs.forEach((blob, i) => {
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
    const uploadDate = new Date(blob.uploadedAt).toLocaleString();
    console.log(`${i + 1}. ${blob.pathname}`);
    console.log(`   Size: ${sizeMB} MB | Uploaded: ${uploadDate}`);
    console.log(`   URL: ${blob.url}\n`);
  });

  // Calculate total size
  const totalSizeMB = blobs.reduce((sum, blob) => sum + blob.size, 0) / (1024 * 1024);
  console.log(`📊 Total storage used: ${totalSizeMB.toFixed(2)} MB / 1024 MB (1 GB limit)\n`);

  // Delete old 0.1.0 versions to make space
  console.log('🗑️  Deleting old builds to free up space...\n');
  
  for (const blob of blobs) {
    // Keep only the LATEST builds, delete everything else
    if (!blob.pathname.includes('LATEST')) {
      console.log(`Deleting: ${blob.pathname}`);
      await del(blob.url, { token });
      console.log(`✅ Deleted\n`);
    }
  }

  console.log('✅ Cleanup complete!');
}

cleanupOldBuilds().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
