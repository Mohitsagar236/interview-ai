/**
 * Download endpoint - Redirects to Cloudflare R2
 * Supports platform + arch selection
 */

export default function handler(req, res) {
    const { platform, arch } = req.query;

    // Latest builds from Cloudflare R2 (unlimited bandwidth, no egress fees!)
    const R2_BASE_URL = process.env.R2_PUBLIC_URL || 'https://pub-25ab7498cafd4a708df4eafca6fa14a3.r2.dev';
    const downloadUrls = {
        windows: {
            x64: `${R2_BASE_URL}/releases/v0.1.0/Interview-AI-Setup-0.1.0-x64.exe`,
            ia32: `${R2_BASE_URL}/releases/v0.1.0/Interview-AI-Setup-0.1.0-ia32.exe`,
            arm64: `${R2_BASE_URL}/releases/v0.1.0/Interview-AI-Setup-0.1.0-x64.exe`
        },
        mac: `${R2_BASE_URL}/releases/v0.1.0/Interview-AI-0.1.0.dmg`,
        linux: `${R2_BASE_URL}/releases/v0.1.0/interview-ai-0.1.0.AppImage`
    };

    let url;

    if (platform === 'windows') {
        const chosenArch = (arch === 'ia32' || arch === 'arm64') ? arch : 'x64';
        url = downloadUrls.windows[chosenArch];
    } else {
        url = downloadUrls[platform];
    }

    if (!url) {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    // Direct redirect to GitHub Releases (unlimited bandwidth)
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.redirect(302, url);
}
