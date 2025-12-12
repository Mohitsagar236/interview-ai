/**
 * Upload desktop installers to GitHub Releases
 * 
 * This replaces Vercel Blob with GitHub Releases (unlimited bandwidth!)
 * 
 * Setup:
 * 1. Create a GitHub Personal Access Token:
 *    - Go to: https://github.com/settings/tokens/new
 *    - Select "public_repo" scope
 *    - Generate token
 * 2. Add to .env file: GITHUB_TOKEN=your_token_here
 * 
 * Usage: node scripts/upload-to-github.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const GITHUB_OWNER = 'Mohitsagar236';
const GITHUB_REPO = 'interview-ai';
const VERSION = 'v0.1.0';

async function githubRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body || '{}'));
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} - ${body}`));
        }
      });
    });
    
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function uploadFile(releaseId, filePath, token) {
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const fileSize = fileBuffer.length;
  
  console.log(`📤 Uploading ${fileName} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)...`);
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'uploads.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(fileName)}`,
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileSize,
        'User-Agent': 'interview-ai-uploader'
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 201) {
          const asset = JSON.parse(body);
          console.log(`✅ Uploaded: ${asset.browser_download_url}\n`);
          resolve(asset.browser_download_url);
        } else {
          reject(new Error(`Upload failed: ${res.statusCode} - ${body}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

async function getOrCreateRelease(token) {
  const options = {
    hostname: 'api.github.com',
    path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${VERSION}`,
    method: 'GET',
    headers: {
      'Authorization': `token ${token}`,
      'User-Agent': 'interview-ai-uploader'
    }
  };
  
  try {
    console.log(`🔍 Checking for existing release ${VERSION}...`);
    const release = await githubRequest(options);
    console.log(`✅ Found existing release: ${release.name}\n`);
    return release;
  } catch (error) {
    // Release doesn't exist, create it
    console.log(`📝 Creating new release ${VERSION}...`);
    
    const createOptions = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'interview-ai-uploader'
      }
    };
    
    const releaseData = JSON.stringify({
      tag_name: VERSION,
      name: `Interview AI ${VERSION}`,
      body: '## Desktop Application\n\nDownload the installer for your platform:\n\n- Windows (64-bit): Interview-AI-Setup-0.1.0-x64.exe\n- Windows (32-bit): Interview-AI-Setup-0.1.0-ia32.exe',
      draft: false,
      prerelease: false
    });
    
    const release = await githubRequest(createOptions, releaseData);
    console.log(`✅ Created release: ${release.name}\n`);
    return release;
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  
  if (!token) {
    console.error('❌ Error: GITHUB_TOKEN environment variable not set');
    console.log('\nTo create a token:');
    console.log('1. Go to: https://github.com/settings/tokens/new');
    console.log('2. Give it a name like "Interview AI Release Uploader"');
    console.log('3. Select "public_repo" scope');
    console.log('4. Generate token');
    console.log('5. Add to .env: GITHUB_TOKEN=your_token_here\n');
    process.exit(1);
  }
  
  const distDir = path.join(__dirname, '..', 'dist');
  
  if (!fs.existsSync(distDir)) {
    console.error(`❌ Error: dist directory not found at ${distDir}`);
    console.log('\nRun the build first: npm run build\n');
    process.exit(1);
  }
  
  const installers = [
    'Interview-AI-Setup-0.1.0-x64.exe',
    'Interview-AI-Setup-0.1.0-ia32.exe'
  ];
  
  // Get or create the release
  const release = await getOrCreateRelease(token);
  
  // Upload each installer
  const urls = {};
  
  for (const installer of installers) {
    const filePath = path.join(distDir, installer);
    if (fs.existsSync(filePath)) {
      try {
        const url = await uploadFile(release.id, filePath, token);
        urls[installer] = url;
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
  console.log(`\n🔗 View release: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/${VERSION}`);
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
