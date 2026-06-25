function normalizeSupabaseUrl(value) {
  return String(value || '')
    .trim()
    .replace(/\/+(rest\/v1|auth\/v1)\/?$/i, '')
    .replace(/\/+$/, '');
}

function supabaseConfig(env) {
  return {
    url: normalizeSupabaseUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  };
}

function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

async function verifySupabaseUser(request, env) {
  const { url, anonKey } = supabaseConfig(env);
  if (!url || !anonKey) {
    return { ok: false, status: 503, error: 'Download login is not configured' };
  }

  const token = bearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: 'Login required before download' };
  }

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return { ok: false, status: 401, error: 'Invalid or expired login session' };
  }

  return { ok: true };
}

export async function onRequestGet({ request, env }) {
  const auth = await verifySupabaseUser(request, env);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const requestUrl = new URL(request.url);
  const platform = requestUrl.searchParams.get('platform');
  const arch = requestUrl.searchParams.get('arch') === 'x64' ? 'x64' : 'x64';

  if (platform !== 'windows') {
    return Response.json({ error: 'Invalid platform' }, { status: 400 });
  }

  const r2BaseUrl = (env.R2_PUBLIC_URL || 'https://pub-25ab7498cafd4a708df4eafca6fa14a3.r2.dev').replace(/\/+$/, '');
  const version = env.APP_VERSION || '0.1.0';
  const buildId = env.APP_BUILD_ID || '20260625-144629';
  const url = `${r2BaseUrl}/releases/v${version}/Interview-AI-Setup-${version}-${arch}.exe?build=${encodeURIComponent(buildId)}`;

  return Response.json({ url }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

export async function onRequestPost() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
