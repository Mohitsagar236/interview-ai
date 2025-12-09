/**
 * Download endpoint - Streams file from GitHub with proper headers
 * Supports platform + arch selection; serves from your domain
 */

const https = require('https');

export default function handler(req, res) {
    const { platform, arch } = req.query;

    const version = '0.1.0';

    // Latest PaddleOCR-enabled build (public blob). Use x64 for all Windows arches for now.
    const blobX64 = `https://iylx1o61xprr6qlb.public.blob.vercel-storage.com/Interview-AI-Setup-${version}-x64.exe`;

    const downloadUrls = {
        windows: {
            x64: blobX64,
            ia32: blobX64,   // fallback to x64 build
            arm64: blobX64   // fallback to x64 build
        },
        mac: blobX64,   // placeholders until mac build is ready
        linux: blobX64  // placeholders until linux build is ready
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
