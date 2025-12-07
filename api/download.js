/**
 * Download proxy endpoint
 * Proxies downloads from GitHub releases to avoid CORS/redirect issues
 */

export default async function handler(req, res) {
    const { platform } = req.query;

    // GitHub release URLs
    const downloadUrls = {
        windows: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/Interview.AI.Setup.0.1.0.exe',
        mac: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/Interview-AI-0.1.0.dmg',
        linux: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/interview-ai-0.1.0.AppImage'
    };

    const url = downloadUrls[platform];

    if (!url) {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    try {
        // Fetch the file from GitHub
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Interview-AI-Downloader'
            },
            redirect: 'follow'
        });

        if (!response.ok) {
            throw new Error(`GitHub download failed: ${response.status}`);
        }

        // Get content type and length
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const contentLength = response.headers.get('content-length');

        // Set appropriate headers for file download
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${getFilename(platform)}"`);
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }

        // Stream the file to the client
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.send(buffer);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ 
            error: 'Download failed',
            message: error.message 
        });
    }
}

function getFilename(platform) {
    const filenames = {
        windows: 'Interview-AI-Setup-0.1.0.exe',
        mac: 'Interview-AI-0.1.0.dmg',
        linux: 'Interview-AI-0.1.0.AppImage'
    };
    return filenames[platform] || 'download';
}
