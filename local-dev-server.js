const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');
const r2BaseUrl = (process.env.R2_PUBLIC_URL || 'https://pub-25ab7498cafd4a708df4eafca6fa14a3.r2.dev').replace(/\/+$/, '');
const version = process.env.APP_VERSION || '0.1.0';
const buildId = process.env.APP_BUILD_ID || '20260625-144629';

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  };
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
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

  return { ok: true };
}

app.use(express.json());
app.use(express.static(publicDir));

app.get('/api/public-config', (_req, res) => {
  const { url, anonKey } = supabaseConfig();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ supabaseUrl: url, supabaseAnonKey: anonKey });
});

app.get('/api/download', async (req, res) => {
  const auth = await verifySupabaseUser(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  if (req.query.platform !== 'windows') {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.json({ url: `${r2BaseUrl}/releases/v${version}/Interview-AI-Setup-${version}-x64.exe?build=${encodeURIComponent(buildId)}` });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Interview AI site preview: http://localhost:${PORT}`);
  console.log('This server previews the static open-source BYOK website only.');
});
