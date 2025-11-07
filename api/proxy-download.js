// Proxy download to force direct download without redirect
export default async function handler(req, res) {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL parameter required' });
    }

    try {
        // Fetch the file from GitHub
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
        }

        // Get the filename from the URL
        const filename = url.split('/').pop();
        
        // Set headers to force download
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        
        // Stream the file to the client
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (error) {
        console.error('Proxy download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
}
