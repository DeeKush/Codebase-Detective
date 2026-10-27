export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const str = (value, max, name) => {
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be a string.`);
  if (value.length > max) throw new HttpError(400, `${name} is too large.`);
  return value;
};

// Best-effort per-key limit (in memory, so per serverless instance). Stops one client from burning quota or guessing passwords.
const hits = new Map();
export function rateLimited(key, { limit = 30, windowMs = 60000, now = Date.now() } = {}) {
  if (!key) return false;
  const bucket = `${limit}:${key}`;
  const recent = (hits.get(bucket) || []).filter(t => now - t < windowMs);
  recent.push(now);
  hits.set(bucket, recent);
  if (hits.size > 5000) for (const [k, times] of hits) if (now - times.at(-1) >= windowMs) hits.delete(k);
  return recent.length > limit;
}
export const clientIp = req => String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
