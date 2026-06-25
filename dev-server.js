const express = require('express');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const R2_BASE_URL = (process.env.R2_PUBLIC_URL || 'https://pub-25ab7498cafd4a708df4eafca6fa14a3.r2.dev').replace(/\/+$/, '');
const VERSION = process.env.APP_VERSION || '0.1.0';
const BUILD_ID = process.env.APP_BUILD_ID || '20260625-144629';
const analyticsModule = import('./lib/analytics-store.mjs');

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

app.get('/api/download', (req, res) => {
  const platform = req.query.platform;

  if (platform !== 'windows') {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  analyticsModule
    .then(({ trackAnalyticsEvent }) => trackAnalyticsEvent({
      req,
      event: 'download',
      metadata: { platform: 'windows', arch: 'x64', version: VERSION, buildId: BUILD_ID, source: 'website' },
    }))
    .catch((error) => console.warn('[analytics] download tracking failed:', error.message))
    .finally(() => {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.redirect(302, `${R2_BASE_URL}/releases/v${VERSION}/Interview-AI-Setup-${VERSION}-x64.exe?build=${encodeURIComponent(BUILD_ID)}`);
    });
});

app.post('/api/telemetry', async (req, res) => {
  try {
    const { trackAnalyticsEvent } = await analyticsModule;
    await trackAnalyticsEvent({
      req,
      event: req.body && req.body.event,
      anonymousId: req.body && req.body.anonymousId,
      metadata: {
        appVersion: req.body && req.body.appVersion,
        os: req.body && req.body.os,
        platform: req.body && req.body.platform,
        source: 'desktop',
      },
    });
  } catch (error) {
    console.warn('[analytics] telemetry tracking failed:', error.message);
  }
  res.status(202).json({ ok: true });
});

app.get('/api/admin-stats', async (req, res) => {
  try {
    const { adminTokenConfigured, analyticsSnapshot, isAdminAuthorized } = await analyticsModule;
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    if (!adminTokenConfigured()) {
      return res.status(503).json({ error: 'Set ADMIN_TOKEN to open the local admin dashboard.' });
    }
    if (!isAdminAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.json(await analyticsSnapshot());
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
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
