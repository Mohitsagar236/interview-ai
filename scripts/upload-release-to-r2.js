#!/usr/bin/env node
'use strict';

/**
 * Upload the current desktop release artifacts to Cloudflare R2.
 *
 * Required .env values:
 * - R2_ACCOUNT_ID
 * - R2_ACCESS_KEY_ID
 * - R2_SECRET_ACCESS_KEY
 * - R2_BUCKET_NAME
 *
 * Optional:
 * - R2_PUBLIC_URL
 */

require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

const packageJson = require('../package.json');

const VERSION = process.env.APP_VERSION || packageJson.version;
const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const RELEASE_PREFIX = `releases/v${VERSION}`;
const PUBLIC_BASE_URL = (process.env.R2_PUBLIC_URL || 'https://pub-25ab7498cafd4a708df4eafca6fa14a3.r2.dev').replace(/\/+$/, '');

const CONTENT_TYPES = new Map([
  ['.exe', 'application/octet-stream'],
  ['.blockmap', 'application/octet-stream'],
  ['.yml', 'application/x-yaml; charset=utf-8'],
]);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest();
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function awsDateParts(date) {
  const iso = date.toISOString();
  return {
    amzDate: iso.replace(/[:-]|\.\d{3}/g, ''),
    dateStamp: iso.slice(0, 10).replace(/-/g, ''),
  };
}

function encodePathSegment(segment) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalPath(bucketName, key) {
  return `/${encodePathSegment(bucketName)}/${key.split('/').map(encodePathSegment).join('/')}`;
}

function signedHeaders({ endpoint, method, canonicalUri, contentType, contentLength, cacheControl, accessKeyId, secretAccessKey }) {
  const { amzDate, dateStamp } = awsDateParts(new Date());
  const region = 'auto';
  const service = 's3';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalHeaders = [
    `host:${endpoint}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';

  const signedHeaderNames = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaderNames,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    Host: endpoint,
    'Content-Type': contentType,
    'Content-Length': contentLength,
    'Cache-Control': cacheControl,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
  };
}

function uploadFile({ filePath, key, client }) {
  const stat = fs.statSync(filePath);
  const contentType = CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
  const canonicalUri = canonicalPath(client.bucketName, key);
  const publicUrl = `${PUBLIC_BASE_URL}/${key}`;
  const headers = signedHeaders({
    endpoint: client.endpoint,
    method: 'PUT',
    canonicalUri,
    contentType,
    contentLength: stat.size,
    cacheControl: 'public, max-age=3600',
    accessKeyId: client.accessKeyId,
    secretAccessKey: client.secretAccessKey,
  });

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: client.endpoint,
      port: 443,
      method: 'PUT',
      path: canonicalUri,
      headers,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(publicUrl);
        } else {
          reject(new Error(`R2 returned ${response.statusCode}: ${body}`));
        }
      });
    });

    request.on('error', reject);
    request.setTimeout(30 * 60 * 1000, () => {
      request.destroy(new Error('Upload timed out'));
    });

    let uploaded = 0;
    let nextProgress = 50 * 1024 * 1024;
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => {
      uploaded += chunk.length;
      if (uploaded >= nextProgress || uploaded === stat.size) {
        const percent = ((uploaded / stat.size) * 100).toFixed(1);
        console.log(`  ${percent}% (${Math.round(uploaded / 1024 / 1024)} MiB / ${Math.round(stat.size / 1024 / 1024)} MiB)`);
        nextProgress += 50 * 1024 * 1024;
      }
    });
    stream.on('error', reject);
    stream.pipe(request);
  });
}

function releaseArtifacts() {
  const names = [
    `Interview-AI-Setup-${VERSION}-x64.exe`,
    `Interview-AI-Setup-${VERSION}-x64.exe.blockmap`,
    'latest.yml',
  ];

  return names
    .map((name) => ({ name, filePath: path.join(DIST_DIR, name), key: `${RELEASE_PREFIX}/${name}` }))
    .filter((artifact) => fs.existsSync(artifact.filePath));
}

async function main() {
  const client = {
    accountId: requiredEnv('R2_ACCOUNT_ID'),
    accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    bucketName: requiredEnv('R2_BUCKET_NAME'),
  };
  client.endpoint = `${client.accountId}.r2.cloudflarestorage.com`;

  const artifacts = releaseArtifacts();
  if (artifacts.length === 0) {
    throw new Error(`No release artifacts found in ${DIST_DIR}`);
  }

  const urls = [];
  for (const artifact of artifacts) {
    const sizeMiB = fs.statSync(artifact.filePath).size / 1024 / 1024;
    console.log(`Uploading ${artifact.name} (${sizeMiB.toFixed(1)} MiB)`);
    const url = await uploadFile({ filePath: artifact.filePath, key: artifact.key, client });
    console.log(`Uploaded ${url}`);
    urls.push(url);
  }

  console.log('\nRelease URLs:');
  for (const url of urls) {
    console.log(url);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
