import crypto from 'node:crypto';
import './env.js';
import { HttpError } from './http.js';

// Sign in with Google (OAuth 2.0 authorization-code flow, server side). Create the client in Google Cloud Console:
// APIs & Services -> Credentials -> OAuth client ID -> Web application, with the redirect URI shown in the README.
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function redirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const host = req.headers?.host || 'localhost:3000';
  const proto = req.headers?.['x-forwarded-proto']?.split(',')[0] || (/^(localhost|127\.0\.0\.1)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}/api/auth/google-callback`;
}

export const newState = () => crypto.randomBytes(24).toString('base64url');

export function authorizationUrl(req, state) {
  if (!googleEnabled()) throw new HttpError(503, 'Google sign-in is not configured.');
  const params = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(req), response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  return `${AUTH_URL}?${params}`;
}

/** Exchanges the code for tokens and returns the verified profile. The id_token comes straight from Google over TLS, so its claims are checked, not re-signed. */
export async function profileFromCode(req, code) {
  let response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(req), grant_type: 'authorization_code' })
    });
  } catch { throw new HttpError(502, 'Could not reach Google. Try again.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id_token) throw new HttpError(401, 'Google did not accept the sign-in. Try again.');
  let claims;
  try { claims = JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64url').toString('utf8')); } catch { throw new HttpError(401, 'Google returned an unreadable response.'); }
  const issuerOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  if (!issuerOk || claims.aud !== process.env.GOOGLE_CLIENT_ID || !(claims.exp > Date.now() / 1000)) throw new HttpError(401, 'Google sign-in could not be verified.');
  if (!claims.email || claims.email_verified !== true) throw new HttpError(401, 'Your Google email address is not verified.');
  return { email: claims.email, name: claims.name };
}
