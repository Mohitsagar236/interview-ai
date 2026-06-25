import { readJsonBody, trackAnalyticsEvent } from '../lib/analytics-store.mjs';

const ALLOWED_EVENTS = new Set([
  'app_launch',
  'app_heartbeat',
  'interview_session_start',
  'interview_session_end',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = await readJsonBody(req);
  const event = typeof body.event === 'string' ? body.event : '';
  if (!ALLOWED_EVENTS.has(event)) {
    return res.status(400).json({ error: 'Invalid telemetry event' });
  }

  try {
    await trackAnalyticsEvent({
      req,
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

  return res.status(202).json({ ok: true });
}
