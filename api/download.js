function supabaseConfig() {
    return {
        url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    };
}

function bearerToken(req) {
    const header = req.headers.authorization || req.headers.Authorization || '';
    return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

async function verifySupabaseUser(req) {
    const { url, anonKey } = supabaseConfig();
    if (!url || !anonKey) {
        return { ok: false, status: 503, error: 'Download login is not configured' };
    }

    const token = bearerToken(req);
    if (!token) {
        return { ok: false, status: 401, error: 'Login required before download' };
    }

    const response = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/user`, {
        headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`
        }
    });

    if (!response.ok) {
        return { ok: false, status: 401, error: 'Invalid or expired login session' };
    }

    return { ok: true, user: await response.json() };
}

/**
 * Authenticated download endpoint.
 * Requires a Supabase user session and returns the published Windows x64 URL.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await verifySupabaseUser(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error });
    }

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

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({ url });
}
