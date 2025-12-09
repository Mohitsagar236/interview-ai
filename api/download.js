/**
 * Download endpoint - Streams file from GitHub with proper headers
 * Supports platform + arch selection; serves from your domain
 */

const https = require('https');

export default function handler(req, res) {
    const { platform, arch } = req.query;

    // Latest PaddleOCR-enabled builds (uploaded via scripts/upload-latest.js)
    const downloadUrls = {
        windows: {
            x64: 'https://iylx1o61xprr6qlb.public.blob.vercel-storage.com/Interview-AI-Setup-LATEST-20251208-2117-x64.exe',
            ia32: 'https://iylx1o61xprr6qlb.public.blob.vercel-storage.com/Interview-AI-Setup-LATEST-20251208-2117-ia32.exe',
            arm64: 'https://iylx1o61xprr6qlb.public.blob.vercel-storage.com/Interview-AI-Setup-LATEST-20251208-2117-x64.exe'
        },
        mac: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/Interview-AI-0.1.0.dmg',
        linux: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/interview-ai-0.1.0.AppImage'
    };

    const filenames = {
        windows: {
            x64: 'Interview-AI-Setup-x64.exe',
            ia32: 'Interview-AI-Setup-ia32.exe',
            arm64: 'Interview-AI-Setup-arm64.exe'
        },
        mac: 'Interview-AI.dmg',
        linux: 'Interview-AI.AppImage'
    };

    let url;
    let filename;

    if (platform === 'windows') {
        const chosenArch = (arch === 'ia32' || arch === 'arm64') ? arch : 'x64';
        url = downloadUrls.windows[chosenArch];
        filename = filenames.windows[chosenArch];
    } else {
        url = downloadUrls[platform];
        filename = filenames[platform];
    }

    if (!url || !filename) {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    // Set download headers before streaming
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Stream file from GitHub to user
    https.get(url, (githubResponse) => {
        // Follow redirects if any
        if (githubResponse.statusCode === 302 || githubResponse.statusCode === 301) {
            const redirectUrl = githubResponse.headers.location;
            https.get(redirectUrl, (redirectedResponse) => {
                if (redirectedResponse.headers['content-length']) {
                    res.setHeader('Content-Length', redirectedResponse.headers['content-length']);
                }
                redirectedResponse.pipe(res);
            }).on('error', (err) => {
                console.error('Redirect stream error:', err);
                res.status(500).json({ error: 'Download failed' });
            });
        } else {
            // Direct response
            if (githubResponse.headers['content-length']) {
                res.setHeader('Content-Length', githubResponse.headers['content-length']);
            }
            githubResponse.pipe(res);
        }
    }).on('error', (err) => {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Download failed' });
    });
}
