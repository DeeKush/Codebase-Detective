import fs from 'node:fs';
import path from 'node:path';
import './env.js';
import { HttpError } from './http.js';

// Key-value storage behind one interface:
//  - Upstash Redis over REST when KV_REST_API_URL/TOKEN (or UPSTASH_REDIS_REST_*) are set (production),
//  - a JSON file under .data/ for local development,
//  - memory when STORE=memory (tests).
const isProduction = () => process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'production';

function upstash(url, token) {
  const call = async command => {
    let response;
    try { response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(8000) }); }
    catch { throw new HttpError(503, 'The database could not be reached. Try again in a moment.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new HttpError(503, 'The database returned an error. Try again in a moment.');
    return data.result;
  };
  return {
    get: async key => call(['GET', key]),
    set: async (key, value) => { await call(['SET', key, value]); },
    setIfAbsent: async (key, value) => (await call(['SET', key, value, 'NX'])) === 'OK',
    del: async key => { await call(['DEL', key]); }
  };
}

function memory(initial = new Map()) {
  return {
    get: async key => initial.get(key) ?? null,
    set: async (key, value) => { initial.set(key, value); },
    setIfAbsent: async (key, value) => { if (initial.has(key)) return false; initial.set(key, value); return true; },
    del: async key => { initial.delete(key); }
  };
}

function file(location) {
  const read = () => { try { return new Map(Object.entries(JSON.parse(fs.readFileSync(location, 'utf8')))); } catch { return new Map(); } };
  const write = map => { fs.mkdirSync(path.dirname(location), { recursive: true }); fs.writeFileSync(location, JSON.stringify(Object.fromEntries(map))); };
  return {
    get: async key => read().get(key) ?? null,
    set: async (key, value) => { const m = read(); m.set(key, value); write(m); },
    setIfAbsent: async (key, value) => { const m = read(); if (m.has(key)) return false; m.set(key, value); write(m); return true; },
    del: async key => { const m = read(); m.delete(key); write(m); }
  };
}

let cached;
export function getStore() {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (process.env.STORE === 'memory') return (cached = memory());
  if (url && token) return (cached = upstash(url, token));
  if (isProduction()) throw new HttpError(503, 'The database is not configured on this deployment.');
  return (cached = file(path.resolve(process.cwd(), '.data/store.json')));
}
export const resetStoreForTests = () => { cached = undefined; };
