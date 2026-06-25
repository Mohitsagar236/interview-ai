import { json, trackEvent } from '../_analytics.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const platform = url.searchParams.get('platform');
  const arch = url.searchParams.get('arch') === 'x64' ? 'x64' : 'x64';

  if (platform !== 'windows') {
    return json({ error: 'Invalid platform' }, 400);
  }

  const r2BaseUrl = (env.R2_PUBLIC_URL || 'https://pub-25ab7498cafd4a708df4eafca6fa14a3.r2.dev').replace(/\/+$/, '');
  const version = env.APP_VERSION || '0.1.0';
  const buildId = env.APP_BUILD_ID || '20260625-144629';
  const target = `${r2BaseUrl}/releases/v${version}/Interview-AI-Setup-${version}-${arch}.exe?build=${encodeURIComponent(buildId)}`;

  try {
    await trackEvent(env, request, {
      event: 'download',
      metadata: {
        platform: 'windows',
        arch,
        version,
        buildId,
        source: 'website',
      },
    });
  } catch (error) {
    console.warn('[analytics] download tracking failed:', error.message);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
