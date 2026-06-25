function normalizeSupabaseUrl(value) {
  return String(value || '')
    .trim()
    .replace(/\/+(rest\/v1|auth\/v1)\/?$/i, '')
    .replace(/\/+$/, '');
}

export async function onRequestGet({ env }) {
  return Response.json({
    supabaseUrl: normalizeSupabaseUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}

export async function onRequestPost() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
