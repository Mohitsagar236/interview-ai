import { adminTokenConfigured, analyticsSnapshot, isAdminAuthorized } from '../lib/analytics-store.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (!adminTokenConfigured()) {
    return res.status(503).json({
      error: 'Admin analytics is not configured. Set ADMIN_TOKEN in the deployment environment.',
    });
  }

  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const snapshot = await analyticsSnapshot();
  return res.status(200).json(snapshot);
}
