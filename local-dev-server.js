const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');
const r2BaseUrl = (process.env.R2_PUBLIC_URL || 'https://pub-25ab7498cafd4a708df4eafca6fa14a3.r2.dev').replace(/\/+$/, '');
const version = process.env.APP_VERSION || '0.1.0';
const buildId = process.env.APP_BUILD_ID || '20260625-144629';

app.use(express.static(publicDir));

app.get('/api/download', (req, res) => {
  if (req.query.platform !== 'windows') {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.redirect(302, `${r2BaseUrl}/releases/v${version}/Interview-AI-Setup-${version}-x64.exe?build=${encodeURIComponent(buildId)}`);
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Interview AI site preview: http://localhost:${PORT}`);
  console.log('This server previews the static open-source BYOK website only.');
});
