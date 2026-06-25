import crypto from 'node:crypto';

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

function memoryStore() {
  if (!globalThis.__interviewAiAnalyticsStore) {
    globalThis.__interviewAiAnalyticsStore = {
      counts: new Map(),
      uniques: new Map(),
      recent: [],
    };
  }
  return globalThis.__interviewAiAnalyticsStore;
}

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

export function analyticsStorageInfo() {
  const redis = redisConfig();
  return redis
    ? { type: 'redis', persistent: true }
    : { type: 'memory', persistent: false, warning: 'Set KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN for persistent analytics.' };
}

async function redisCommand(command) {
  const redis = redisConfig();
  if (!redis) return null;

  const response = await fetch(redis.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redis.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Redis command failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function countIncrement(key) {
  if (redisConfig()) {
    await redisCommand(['INCR', key]);
    return;
  }

  const store = memoryStore();
  store.counts.set(key, Number(store.counts.get(key) || 0) + 1);
}

async function countGet(key) {
  if (redisConfig()) {
    return Number((await redisCommand(['GET', key])) || 0);
  }

  return Number(memoryStore().counts.get(key) || 0);
}

async function uniqueAdd(key, value) {
  if (!value) return;

  if (redisConfig()) {
    await redisCommand(['PFADD', key, value]);
    return;
  }

  const store = memoryStore();
  if (!store.uniques.has(key)) store.uniques.set(key, new Set());
  store.uniques.get(key).add(value);
}

async function uniqueCount(key) {
  if (redisConfig()) {
    return Number((await redisCommand(['PFCOUNT', key])) || 0);
  }

  return Number(memoryStore().uniques.get(key)?.size || 0);
}

async function pushRecentEvent(event) {
  const entry = JSON.stringify(event);

  if (redisConfig()) {
    await redisCommand(['LPUSH', `${PREFIX}:recent`, entry]);
    await redisCommand(['LTRIM', `${PREFIX}:recent`, 0, 49]);
    return;
  }

  const store = memoryStore();
  store.recent.unshift(event);
  store.recent = store.recent.slice(0, 50);
}

async function recentEvents() {
  if (redisConfig()) {
    const items = await redisCommand(['LRANGE', `${PREFIX}:recent`, 0, 24]);
    return (items || []).map((item) => {
      try {
        return JSON.parse(item);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  return memoryStore().recent.slice(0, 25);
}

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

function getHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const value = headers[name] || headers[name.toLowerCase()] || '';
  return Array.isArray(value) ? value[0] : value;
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function requestIp(req) {
  const headers = req?.headers || {};
  const forwarded = getHeader(headers, 'x-forwarded-for');
  return (forwarded ? forwarded.split(',')[0] : '') || getHeader(headers, 'cf-connecting-ip') || '';
}

export function requestUserAgent(req) {
  return getHeader(req?.headers || {}, 'user-agent') || '';
}

function actorIdFor(req, explicitAnonymousId) {
  if (explicitAnonymousId) return hash(`app:${explicitAnonymousId}`);
  const ip = requestIp(req);
  const ua = requestUserAgent(req);
  const day = dayKey();
  if (!ip && !ua) return '';
  return hash(`web:${day}:${ip}:${ua}`);
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

export async function trackAnalyticsEvent({ req, event, anonymousId, metadata = {} }) {
  if (!EVENTS.has(event)) {
    throw new Error(`Unsupported analytics event: ${event}`);
  }

  const metric = EVENT_METRIC[event];
  const now = new Date();
  const day = dayKey(now);
  const actorId = actorIdFor(req, anonymousId);

  await countIncrement(`${PREFIX}:count:${metric}:total`);
  await countIncrement(`${PREFIX}:count:${metric}:day:${day}`);
  await uniqueAdd(`${PREFIX}:unique:${metric}:day:${day}`, actorId);
  await uniqueAdd(`${PREFIX}:unique:${metric}:all`, actorId);

  if (event.startsWith('app_') || event.startsWith('interview_')) {
    await uniqueAdd(`${PREFIX}:unique:activeUsers:day:${day}`, actorId);
    await uniqueAdd(`${PREFIX}:unique:activeUsers:all`, actorId);
  }

  await pushRecentEvent({
    event,
    ts: now.toISOString(),
    day,
    metadata: cleanMetadata(metadata),
  });

  return { ok: true, storage: analyticsStorageInfo() };
}

async function metricSummary(metric, days) {
  const byDay = [];
  for (const day of days) {
    byDay.push({
      day,
      count: await countGet(`${PREFIX}:count:${metric}:day:${day}`),
      unique: await uniqueCount(`${PREFIX}:unique:${metric}:day:${day}`),
    });
  }

  return {
    total: await countGet(`${PREFIX}:count:${metric}:total`),
    totalUnique: await uniqueCount(`${PREFIX}:unique:${metric}:all`),
    today: byDay[byDay.length - 1]?.count || 0,
    todayUnique: byDay[byDay.length - 1]?.unique || 0,
    last7Days: byDay.slice(-7).reduce((sum, item) => sum + item.count, 0),
    last30Days: byDay.reduce((sum, item) => sum + item.count, 0),
    byDay,
  };
}

async function uniqueSummary(metric, days) {
  const byDay = [];
  for (const day of days) {
    byDay.push({
      day,
      unique: await uniqueCount(`${PREFIX}:unique:${metric}:day:${day}`),
    });
  }

  return {
    totalUnique: await uniqueCount(`${PREFIX}:unique:${metric}:all`),
    todayUnique: byDay[byDay.length - 1]?.unique || 0,
    last7DailyActive: byDay.slice(-7).reduce((sum, item) => sum + item.unique, 0),
    last30DailyActive: byDay.reduce((sum, item) => sum + item.unique, 0),
    byDay,
  };
}

export async function analyticsSnapshot() {
  const days = lastDays(30);
  return {
    generatedAt: new Date().toISOString(),
    storage: analyticsStorageInfo(),
    downloads: await metricSummary('downloads', days),
    appLaunches: await metricSummary('appLaunches', days),
    appHeartbeats: await metricSummary('appHeartbeats', days),
    sessionsStarted: await metricSummary('sessionsStarted', days),
    sessionsEnded: await metricSummary('sessionsEnded', days),
    activeUsers: await uniqueSummary('activeUsers', days),
    recentEvents: await recentEvents(),
  };
}

export function isAdminAuthorized(req) {
  const token = process.env.ADMIN_TOKEN || process.env.ADMIN_PASSWORD || '';
  if (!token) return false;

  const authorization = getHeader(req?.headers || {}, 'authorization');
  const bearer = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7) : '';
  const queryToken = req?.query?.token || '';
  const supplied = bearer || queryToken;
  if (!supplied) return false;

  const expected = Buffer.from(token);
  const actual = Buffer.from(String(supplied));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function adminTokenConfigured() {
  return Boolean(process.env.ADMIN_TOKEN || process.env.ADMIN_PASSWORD);
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024) {
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}
