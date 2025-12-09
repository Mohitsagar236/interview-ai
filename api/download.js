/**
 * Download endpoint - Redirects to Vercel Blob Storage
 * Supports platform + arch selection
 */

export default function handler(req, res) {
    const { platform, arch } = req.query;

    // Latest builds with toolbar labels and close button (uploaded 2025-12-10)
    const downloadUrls = {
        windows: {
            x64: 'https://iylx1o61xprr6qlb.public.blob.vercel-storage.com/Interview-AI-Setup-0.1.0-x64.exe',
            ia32: 'https://iylx1o61xprr6qlb.public.blob.vercel-storage.com/Interview-AI-Setup-0.1.0-ia32.exe',
            arm64: 'https://iylx1o61xprr6qlb.public.blob.vercel-storage.com/Interview-AI-Setup-0.1.0-x64.exe'
        },
        mac: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/Interview-AI-0.1.0.dmg',
        linux: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/interview-ai-0.1.0.AppImage'
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

    // Direct redirect to blob storage (public URLs handle downloads properly)
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.redirect(302, url);
}
