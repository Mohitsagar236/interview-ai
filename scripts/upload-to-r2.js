/**
 * Upload desktop installers to Cloudflare R2
 * 
 * R2 is perfect for private repos - FREE tier includes:
 * - 10 GB storage
 * - 10 million requests/month
 * - NO EGRESS FEES (unlimited downloads!)
 * 
 * Setup:
 * 1. Create Cloudflare account (free): https://dash.cloudflare.com/sign-up
 * 2. Go to R2 > Create bucket (e.g., "interview-ai-releases")
 * 3. Create API token with R2 edit permissions
 * 4. Add to .env:
 *    R2_ACCOUNT_ID=your_account_id
 *    R2_ACCESS_KEY_ID=your_access_key
 *    R2_SECRET_ACCESS_KEY=your_secret_key
 *    R2_BUCKET_NAME=your_bucket_name
 * 
 * Usage: node scripts/upload-to-r2.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const VERSION = '0.1.0';

// AWS S3-compatible API (R2 uses S3 protocol)
class R2Client {
    constructor(accountId, accessKeyId, secretAccessKey, bucketName) {
        this.accountId = accountId;
        this.accessKeyId = accessKeyId;
        this.secretAccessKey = secretAccessKey;
        this.bucketName = bucketName;
        this.endpoint = `${accountId}.r2.cloudflarestorage.com`;
    }

    async uploadFile(filePath, key) {
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        const fileSize = fileBuffer.length;
        
        console.log(`📤 Uploading ${fileName} (${(fileSize / (1024 * 1024)).toFixed(2)} MB) to R2...`);

        const date = new Date();
        const dateStamp = date.toISOString().split('T')[0].replace(/-/g, '');
        const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const contentType = 'application/octet-stream';
        
        // AWS Signature Version 4
        const region = 'auto';
        const service = 's3';
        const canonicalUri = `/${this.bucketName}/${key}`;
        const canonicalHeaders = `host:${this.endpoint}\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:${amzDate}\n`;
        const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
        const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
        
        const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
        const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;
        
        const kDate = crypto.createHmac('sha256', `AWS4${this.secretAccessKey}`).update(dateStamp).digest();
        const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
        const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
        const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
        const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
        
        const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.endpoint,
                port: 443,
                path: canonicalUri,
                method: 'PUT',
                headers: {
                    'Host': this.endpoint,
                    'x-amz-date': amzDate,
                    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
                    'Content-Type': contentType,
                    'Content-Length': fileSize,
                    'Authorization': authorization
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        // Generate public URL - extract account hash from bucket endpoint
                        const publicUrl = `https://pub-bd0f8fce43ae498088abfcbd6d669f15.r2.dev/${key}`;
                        console.log(`✅ Uploaded: ${publicUrl}\n`);
                        resolve(publicUrl);
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
}

async function main() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME || 'interview-ai-releases';
    
    if (!accountId || !accessKeyId || !secretAccessKey) {
        console.error('❌ Error: R2 credentials not set');
        console.log('\nSetup instructions:');
        console.log('1. Create Cloudflare account: https://dash.cloudflare.com/sign-up');
        console.log('2. Go to R2 Object Storage');
        console.log('3. Create a bucket (e.g., "interview-ai-releases")');
        console.log('4. Go to R2 > Manage R2 API Tokens > Create API token');
        console.log('5. Add to .env file:');
        console.log('   R2_ACCOUNT_ID=your_account_id');
        console.log('   R2_ACCESS_KEY_ID=your_access_key');
        console.log('   R2_SECRET_ACCESS_KEY=your_secret_key');
        console.log('   R2_BUCKET_NAME=interview-ai-releases\n');
        process.exit(1);
    }
    
    const distDir = path.join(__dirname, '..', 'dist');
    
    if (!fs.existsSync(distDir)) {
        console.error(`❌ Error: dist directory not found at ${distDir}`);
        console.log('\nRun the build first: npm run build\n');
        process.exit(1);
    }
    
    // Each entry: [preferred filename, fallback filename, R2 upload key]
    const candidates = [
        ['Interview-AI-Setup-0.1.0-x64.exe',             'Interview AI Assistant-Setup-0.1.0-x64.exe',  'Interview-AI-Setup-0.1.0-x64.exe'],
        ['Interview-AI-Setup-0.1.0-ia32.exe',            'Interview AI Assistant-Setup-0.1.0-ia32.exe', 'Interview-AI-Setup-0.1.0-ia32.exe'],
        ['Interview AI Assistant-Portable-0.1.0.exe',    'Interview-AI-Portable-0.1.0.exe',             'Interview-AI-Portable-0.1.0.exe'],
    ];
    const installers = candidates.map(([preferred, fallback, uploadName]) => {
        const preferredPath = path.join(distDir, preferred);
        const fallbackPath  = path.join(distDir, fallback);
        if (fs.existsSync(preferredPath)) return { file: preferredPath, key: uploadName };
        if (fs.existsSync(fallbackPath))  return { file: fallbackPath,  key: uploadName };
        return null;
    }).filter(Boolean);
    
    const client = new R2Client(accountId, accessKeyId, secretAccessKey, bucketName);
    const urls = {};
    
    for (const { file, key: uploadName } of installers) {
        try {
            const r2Key = `releases/v${VERSION}/${uploadName}`;
            const url = await client.uploadFile(file, r2Key);
            urls[uploadName] = url;
        } catch (error) {
            console.error(`❌ Failed to upload ${uploadName}:`, error.message);
        }
    }
    
    console.log('\n✅ All done!\n');
    console.log('📋 Download URLs (update your API files with these):');
    console.log(JSON.stringify(urls, null, 2));
    console.log('\n💡 These URLs are public and work with unlimited bandwidth!');
    console.log('💡 R2 has NO egress fees - downloads are FREE!');
}

main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});
