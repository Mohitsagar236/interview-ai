const express = require('express');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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
