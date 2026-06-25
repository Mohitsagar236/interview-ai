const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');
const r2BaseUrl = (process.env.R2_PUBLIC_URL || 'https://pub-25ab7498cafd4a708df4eafca6fa14a3.r2.dev').replace(/\/+$/, '');
const version = process.env.APP_VERSION || '0.1.0';
const buildId = process.env.APP_BUILD_ID || '20260625-144629';
const analyticsModule = import('./lib/analytics-store.mjs');

app.use(express.json());
app.use(express.static(publicDir));

app.get('/api/download', (req, res) => {
  if (req.query.platform !== 'windows') {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  analyticsModule
    .then(({ trackAnalyticsEvent }) => trackAnalyticsEvent({
      req,
      event: 'download',
      metadata: { platform: 'windows', arch: 'x64', version, buildId, source: 'website' },
    }))
    .catch((error) => console.warn('[analytics] download tracking failed:', error.message))
    .finally(() => {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.redirect(302, `${r2BaseUrl}/releases/v${version}/Interview-AI-Setup-${version}-x64.exe?build=${encodeURIComponent(buildId)}`);
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

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Interview AI site preview: http://localhost:${PORT}`);
  console.log('This server previews the static open-source BYOK website only.');
});
