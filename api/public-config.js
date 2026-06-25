/**
 * Public browser configuration.
 * Supabase anon keys are designed to be public; never expose service-role keys here.
 */
export default function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json({
        supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    });
}
