const express = require('express');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const R2_BASE_URL = (process.env.R2_PUBLIC_URL || 'https://pub-25ab7498cafd4a708df4eafca6fa14a3.r2.dev').replace(/\/+$/, '');
const VERSION = process.env.APP_VERSION || '0.1.0';
const BUILD_ID = process.env.APP_BUILD_ID || '20260625-144629';

function normalizeSupabaseUrl(value) {
  return String(value || '')
    .trim()
    .replace(/\/+(rest\/v1|auth\/v1)\/?$/i, '')
    .replace(/\/+$/, '');
}

function supabaseConfig() {
  return {
    url: normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
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

  const response = await fetch(`${url}/auth/v1/user`, {
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
app.use(express.urlencoded({ extended: true }));

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// Minimal API stubs so the web frontend doesn't 404 on API calls
// Since the app is now free/BYOK, most endpoints just return success.

app.get('/api/profile-data', (req, res) => {
  res.json({ plan: 'free', credits: null, sessions: null });
});

app.post('/api/activation', (req, res) => {
  res.json({ success: true, activated: true, plan: 'free' });
});

app.post('/api/grant-free-credits', (req, res) => {
  res.json({ success: true });
});

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

  const platform = req.query.platform;

  if (platform !== 'windows') {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.json({ url: `${R2_BASE_URL}/releases/v${VERSION}/Interview-AI-Setup-${VERSION}-x64.exe?build=${encodeURIComponent(BUILD_ID)}` });
});

// Catch-all: serve index.html for client-side routing
app.use((req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Not found');
  }
});

app.listen(PORT, () => {
  console.log(`Web server running at http://localhost:${PORT}`);
  console.log(`Serving static files from: ${path.join(__dirname, 'public')}`);
});
