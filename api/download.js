/**
 * Download endpoint - Streams file from GitHub with proper headers
 * This avoids redirect and serves file directly from your domain
 */

const https = require('https');

export default function handler(req, res) {
    const { platform } = req.query;

    // GitHub release direct download URLs
    const downloadUrls = {
        windows: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/Interview.AI.Setup.0.1.0.exe',
        mac: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/Interview-AI-0.1.0.dmg',
        linux: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/interview-ai-0.1.0.AppImage'
    };

    const filenames = {
        windows: 'Interview-AI-Setup.exe',
        mac: 'Interview-AI.dmg',
        linux: 'Interview-AI.AppImage'
    };

    const url = downloadUrls[platform];
    const filename = filenames[platform];

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
