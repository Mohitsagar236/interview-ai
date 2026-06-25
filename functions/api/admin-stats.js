import { adminTokenConfigured, isAuthorized, json, snapshot } from '../_analytics.js';

export async function onRequestGet({ request, env }) {
  if (!adminTokenConfigured(env)) {
    return json({
      error: 'Admin analytics is not configured. Set ADMIN_TOKEN in the Cloudflare Pages environment.',
    }, 503);
  }

  if (!isAuthorized(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  return json(await snapshot(env));
}
