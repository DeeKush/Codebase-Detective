import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from './http.js';
import { getStore } from './store.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'cd_session';
const MAX_AGE_S = 7 * 24 * 3600;
const isProduction = () => process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'production';

function secret() {
  const value = process.env.AUTH_SECRET;
  if (value && value.length >= 16) return value;
  if (isProduction()) throw new HttpError(503, 'Sign-in is not configured on this deployment.');
  return 'development-only-secret-do-not-use';
}
const b64 = buffer => Buffer.from(buffer).toString('base64url');
const hmac = data => crypto.createHmac('sha256', secret()).update(data).digest('base64url');
const equal = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export const normalizeEmail = email => String(email ?? '').trim().toLowerCase();
export function checkCredentials({ name, email, password }, { needName }) {
  if (needName && !String(name ?? '').trim()) return 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email)) || normalizeEmail(email).length > 120) return 'Enter a valid email address.';
  if (typeof password !== 'string' || password.length < 8) return 'Use a password with at least 8 characters.';
  if (password.length > 200) return 'That password is too long.';
  return '';
}

// scrypt (memory-hard) with a random per-user salt. Format: scrypt$<salt>$<hash>
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${b64(salt)}$${b64(await scrypt(password, salt, 64))}`;
}
export async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  return equal(b64(await scrypt(password, Buffer.from(salt, 'base64url'), 64)), hash);
}
const DUMMY = `scrypt$${b64(Buffer.alloc(16))}$${b64(Buffer.alloc(64))}`;

export function signToken(payload) {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + MAX_AGE_S }));
  return `${body}.${hmac(body)}`;
}
export function readToken(token) {
  const [body, signature] = String(token ?? '').split('.');
  if (!body || !signature || !equal(hmac(body), signature)) return null;
  try { const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return payload.exp > Date.now() / 1000 ? payload : null; } catch { return null; }
}
// Proof that a grading result came from this server for this user (used by /api/assess).
export const proofFor = (email, data) => hmac(`proof:${email}:${JSON.stringify(data)}`);

const cookieAttributes = () => `Path=/; HttpOnly; SameSite=Lax${isProduction() ? '; Secure' : ''}`;
export const sessionCookie = token => `${COOKIE}=${token}; Max-Age=${MAX_AGE_S}; ${cookieAttributes()}`;
export const clearCookie = () => `${COOKIE}=; Max-Age=0; ${cookieAttributes()}`;
const cookieValue = req => String(req.headers?.cookie || '').split(';').map(c => c.trim().split('=')).find(([k]) => k === COOKIE)?.[1];

/** Returns {email, name} for a valid session cookie, otherwise null. */
export function currentUser(req) {
  const payload = readToken(cookieValue(req));
  return payload ? { email: payload.sub, name: payload.name } : null;
}
export function requireUser(req) {
  const user = currentUser(req);
  if (!user) throw new HttpError(401, 'Your session has expired. Log in again.');
  return user;
}

// State-changing requests must come from this site. Browsers always send Origin on cross-site POST/PUT/DELETE.
export function assertSameOrigin(req) {
  const origin = req.headers?.origin, host = req.headers?.host;
  if (!origin) return;
  let originHost; try { originHost = new URL(origin).host; } catch { throw new HttpError(403, 'Request blocked.'); }
  if (originHost !== host) throw new HttpError(403, 'Request blocked.');
}

export async function signUp({ name, email, password }) {
  const problem = checkCredentials({ name, email, password }, { needName: true });
  if (problem) throw new HttpError(400, problem);
  const id = normalizeEmail(email);
  const created = await getStore().setIfAbsent(`user:${id}`, JSON.stringify({ name: name.trim().slice(0, 60), hash: await hashPassword(password), createdAt: Date.now() }));
  if (!created) throw new HttpError(409, 'An account with this email already exists. Log in instead.');
  return { email: id, name: name.trim().slice(0, 60) };
}
export async function logIn({ email, password }) {
  const problem = checkCredentials({ email, password }, { needName: false });
  if (problem) throw new HttpError(400, problem);
  const id = normalizeEmail(email), raw = await getStore().get(`user:${id}`), user = raw && JSON.parse(raw);
  const ok = await verifyPassword(password, user?.hash ?? DUMMY); // same work whether or not the account exists
  if (!user || !ok) throw new HttpError(401, 'Email or password is incorrect.');
  return { email: id, name: user.name };
}
