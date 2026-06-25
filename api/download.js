import { trackAnalyticsEvent } from '../lib/analytics-store.mjs';

/**
 * Download endpoint.
 * Supports the currently published Windows x64 desktop build and tracks clicks.
 */
export default async function handler(req, res) {
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
    let chosenArch = 'x64';

    if (platform === 'windows') {
        chosenArch = arch === 'x64' ? 'x64' : 'x64';
        url = downloadUrls.windows[chosenArch];
    } else {
        url = downloadUrls[platform];
    }

    if (!url) {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    try {
        await trackAnalyticsEvent({
            req,
            event: 'download',
            metadata: {
                platform: 'windows',
                arch: chosenArch,
                version: VERSION,
                buildId: BUILD_ID,
                source: 'website',
            },
        });
    } catch (error) {
        console.warn('[analytics] download tracking failed:', error.message);
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.redirect(302, url);
}
