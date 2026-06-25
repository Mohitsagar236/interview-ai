import { json, trackEvent } from '../_analytics.js';

const ALLOWED_EVENTS = new Set([
  'app_launch',
  'app_heartbeat',
  'interview_session_start',
  'interview_session_end',
]);

export async function onRequestPost({ request, env }) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const event = typeof body.event === 'string' ? body.event : '';
  if (!ALLOWED_EVENTS.has(event)) {
    return json({ error: 'Invalid telemetry event' }, 400);
  }

  try {
    await trackEvent(env, request, {
      event,
      anonymousId: body.anonymousId,
      metadata: {
        appVersion: body.appVersion,
        os: body.os,
        platform: body.platform,
        source: 'desktop',
      },
    });
  } catch (error) {
    console.warn('[analytics] telemetry tracking failed:', error.message);
  }

  return json({ ok: true }, 202);
}

export async function onRequestGet() {
  return json({ error: 'Method not allowed' }, 405);
}
