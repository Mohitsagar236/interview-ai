const PREFIX = 'ia:analytics:v1';
const EVENTS = new Set([
  'download',
  'app_launch',
  'app_heartbeat',
  'interview_session_start',
  'interview_session_end',
]);

const EVENT_METRIC = {
  download: 'downloads',
  app_launch: 'appLaunches',
  app_heartbeat: 'appHeartbeats',
  interview_session_start: 'sessionsStarted',
  interview_session_end: 'sessionsEnded',
};

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function lastDays(count) {
  const days = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - i);
    days.push(dayKey(date));
  }
  return days;
}

async function hash(value) {
  const encoded = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function kv(env) {
  return env.ANALYTICS_KV || env.InterviewAiAnalytics || env.interview_ai_analytics || null;
}

export function storageInfo(env) {
  return kv(env)
    ? { type: 'cloudflare-kv', persistent: true }
    : { type: 'none', persistent: false, warning: 'Bind a Cloudflare KV namespace named ANALYTICS_KV for persistent analytics.' };
}

async function readJson(env, key, fallback) {
  const store = kv(env);
  if (!store) return fallback;
  const value = await store.get(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function writeJson(env, key, value) {
  const store = kv(env);
  if (!store) return;
  await store.put(key, JSON.stringify(value));
}

async function increment(env, key) {
  const current = Number(await readJson(env, key, 0)) || 0;
  await writeJson(env, key, current + 1);
}

async function count(env, key) {
  return Number(await readJson(env, key, 0)) || 0;
}

async function addUnique(env, key, value) {
  if (!value) return;
  const items = await readJson(env, key, []);
  if (!items.includes(value)) {
    items.push(value);
    await writeJson(env, key, items.slice(-20000));
  }
}

async function uniqueCount(env, key) {
  const items = await readJson(env, key, []);
  return Array.isArray(items) ? items.length : 0;
}

function cleanMetadata(metadata = {}) {
  const result = {};
  const allowed = ['platform', 'arch', 'version', 'buildId', 'appVersion', 'os', 'source'];
  for (const key of allowed) {
    const value = metadata[key];
    if (typeof value === 'string' && value.length <= 120) result[key] = value;
  }
  return result;
}

async function actorIdFor(request, explicitAnonymousId) {
  if (explicitAnonymousId) return hash(`app:${explicitAnonymousId}`);
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const ip = (forwarded ? forwarded.split(',')[0] : '') || request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  if (!ip && !ua) return '';
  return hash(`web:${dayKey()}:${ip}:${ua}`);
}

async function pushRecent(env, event) {
  const items = await readJson(env, `${PREFIX}:recent`, []);
  items.unshift(event);
  await writeJson(env, `${PREFIX}:recent`, items.slice(0, 50));
}

async function recentEvents(env) {
  return (await readJson(env, `${PREFIX}:recent`, [])).slice(0, 25);
}

export async function trackEvent(env, request, { event, anonymousId, metadata = {} }) {
  if (!EVENTS.has(event)) throw new Error(`Unsupported analytics event: ${event}`);
  if (!kv(env)) return { ok: true, storage: storageInfo(env), skipped: true };

  const metric = EVENT_METRIC[event];
  const now = new Date();
  const day = dayKey(now);
  const actorId = await actorIdFor(request, anonymousId);

  await increment(env, `${PREFIX}:count:${metric}:total`);
  await increment(env, `${PREFIX}:count:${metric}:day:${day}`);
  await addUnique(env, `${PREFIX}:unique:${metric}:day:${day}`, actorId);
  await addUnique(env, `${PREFIX}:unique:${metric}:all`, actorId);

  if (event.startsWith('app_') || event.startsWith('interview_')) {
    await addUnique(env, `${PREFIX}:unique:activeUsers:day:${day}`, actorId);
    await addUnique(env, `${PREFIX}:unique:activeUsers:all`, actorId);
  }

  await pushRecent(env, {
    event,
    ts: now.toISOString(),
    day,
    metadata: cleanMetadata(metadata),
  });

  return { ok: true, storage: storageInfo(env) };
}

async function metricSummary(env, metric, days) {
  const byDay = [];
  for (const day of days) {
    byDay.push({
      day,
      count: await count(env, `${PREFIX}:count:${metric}:day:${day}`),
      unique: await uniqueCount(env, `${PREFIX}:unique:${metric}:day:${day}`),
    });
  }

  return {
    total: await count(env, `${PREFIX}:count:${metric}:total`),
    totalUnique: await uniqueCount(env, `${PREFIX}:unique:${metric}:all`),
    today: byDay[byDay.length - 1]?.count || 0,
    todayUnique: byDay[byDay.length - 1]?.unique || 0,
    last7Days: byDay.slice(-7).reduce((sum, item) => sum + item.count, 0),
    last30Days: byDay.reduce((sum, item) => sum + item.count, 0),
    byDay,
  };
}

async function uniqueSummary(env, metric, days) {
  const byDay = [];
  for (const day of days) {
    byDay.push({
      day,
      unique: await uniqueCount(env, `${PREFIX}:unique:${metric}:day:${day}`),
    });
  }

  return {
    totalUnique: await uniqueCount(env, `${PREFIX}:unique:${metric}:all`),
    todayUnique: byDay[byDay.length - 1]?.unique || 0,
    last7DailyActive: byDay.slice(-7).reduce((sum, item) => sum + item.unique, 0),
    last30DailyActive: byDay.reduce((sum, item) => sum + item.unique, 0),
    byDay,
  };
}

export async function snapshot(env) {
  const days = lastDays(30);
  return {
    generatedAt: new Date().toISOString(),
    storage: storageInfo(env),
    downloads: await metricSummary(env, 'downloads', days),
    appLaunches: await metricSummary(env, 'appLaunches', days),
    appHeartbeats: await metricSummary(env, 'appHeartbeats', days),
    sessionsStarted: await metricSummary(env, 'sessionsStarted', days),
    sessionsEnded: await metricSummary(env, 'sessionsEnded', days),
    activeUsers: await uniqueSummary(env, 'activeUsers', days),
    recentEvents: await recentEvents(env),
  };
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

export function isAuthorized(request, env) {
  const token = env.ADMIN_TOKEN || env.ADMIN_PASSWORD || '';
  if (!token) return false;
  const header = request.headers.get('authorization') || '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7) : '';
  const query = new URL(request.url).searchParams.get('token') || '';
  return (bearer || query) === token;
}

export function adminTokenConfigured(env) {
  return Boolean(env.ADMIN_TOKEN || env.ADMIN_PASSWORD);
}
