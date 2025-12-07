/**
 * Download proxy endpoint
 * Redirects to GitHub releases for direct downloads (works for all users)
 */

export default async function handler(req, res) {
    const { platform } = req.query;

    // GitHub release direct download URLs
    const downloadUrls = {
        windows: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/Interview.AI.Setup.0.1.0.exe',
        mac: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/Interview-AI-0.1.0.dmg',
        linux: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/interview-ai-0.1.0.AppImage'
    };

    const url = downloadUrls[platform];

    if (!url) {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    // Method 1: Direct redirect (fastest, works for all users)
    // GitHub releases are publicly accessible via direct links
    res.redirect(302, url);
}
