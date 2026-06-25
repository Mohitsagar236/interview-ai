/**
 * Download endpoint.
 * Supports the currently published Windows x64 desktop build.
 */

export default function handler(req, res) {
    const { platform, arch } = req.query;

    // Configure this in Vercel for your release bucket or GitHub Releases URL.
    const R2_BASE_URL = (process.env.R2_PUBLIC_URL || 'https://pub-25ab7498cafd4a708df4eafca6fa14a3.r2.dev').replace(/\/+$/, '');
    const VERSION = process.env.APP_VERSION || '0.1.0';
    const BUILD_ID = process.env.APP_BUILD_ID || '20260625-144629';
    const downloadQuery = `?build=${encodeURIComponent(BUILD_ID)}`;
    const downloadUrls = {
        windows: {
            x64: `${R2_BASE_URL}/releases/v${VERSION}/Interview-AI-Setup-${VERSION}-x64.exe${downloadQuery}`
        }
    };

    let url;

    if (platform === 'windows') {
        const chosenArch = arch === 'x64' ? 'x64' : 'x64';
        url = downloadUrls.windows[chosenArch];
    } else {
        url = downloadUrls[platform];
    }

    if (!url) {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.redirect(302, url);
}
