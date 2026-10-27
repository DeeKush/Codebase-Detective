// Device-local accounts. Passwords are salted and stretched with PBKDF2 before they are stored, and nothing leaves the
// browser. This separates people who share a machine and keeps each person's rounds apart; it is not server-side
// authentication, so it must not be used to protect anything valuable or to verify identity across devices.
const USERS_KEY = 'codebaseDetective.users.v1';
const CURRENT_KEY = 'codebaseDetective.currentUser.v1';
const ROUNDS_KEY = 'codebaseDetective.rounds.v1';
const ITERATIONS = 150000;
const MAX_ROUNDS = 50;

export class AuthError extends Error {}

const store = () => { try { return globalThis.localStorage; } catch { return null; } };
const readJson = (key, fallback) => { try { const v = JSON.parse(store()?.getItem(key)); return v ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { store().setItem(key, JSON.stringify(value)); } catch { throw new AuthError('This browser is blocking local storage, so accounts cannot be saved. Allow site data and try again.'); } };

const toB64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return toB64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
const sameText = (a, b) => { let diff = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return diff === 0; };

export const normalizeEmail = email => String(email ?? '').trim().toLowerCase();
export function validate({ name, email, password }, { needName }) {
  if (needName && !String(name ?? '').trim()) return 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email))) return 'Enter a valid email address.';
  if (String(password ?? '').length < 8) return 'Use a password with at least 8 characters.';
  return '';
}

export function currentUser() {
  const email = readJson(CURRENT_KEY, null), user = email && readJson(USERS_KEY, {})[email];
  return user ? { email, name: user.name } : null;
}

export async function signUp({ name, email, password }) {
  const problem = validate({ name, email, password }, { needName: true });
  if (problem) throw new AuthError(problem);
  const id = normalizeEmail(email), users = readJson(USERS_KEY, {});
  if (users[id]) throw new AuthError('An account with this email already exists. Log in instead.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  users[id] = { name: name.trim().slice(0, 60), salt: toB64(salt), iterations: ITERATIONS, hash: await derive(password, salt, ITERATIONS), createdAt: Date.now() };
  writeJson(USERS_KEY, users); writeJson(CURRENT_KEY, id);
  return currentUser();
}

export async function logIn({ email, password }) {
  const problem = validate({ email, password }, { needName: false });
  if (problem) throw new AuthError(problem);
  const id = normalizeEmail(email), user = readJson(USERS_KEY, {})[id];
  // Same message and same work for unknown accounts and wrong passwords.
  const salt = user ? fromB64(user.salt) : new Uint8Array(16), hash = await derive(password, salt, user?.iterations ?? ITERATIONS);
  if (!user || !sameText(hash, user.hash)) throw new AuthError('Email or password is incorrect.');
  writeJson(CURRENT_KEY, id);
  return currentUser();
}

export function logOut() { try { store()?.removeItem(CURRENT_KEY); } catch { /* ignore */ } }

/** Finished rounds for the signed-in user, newest first. Recording the same session twice keeps one entry. */
export function rounds() {
  const user = currentUser();
  return user ? (readJson(ROUNDS_KEY, {})[user.email] || []) : [];
}
export function recordRound(entry) {
  const user = currentUser();
  if (!user) return;
  const all = readJson(ROUNDS_KEY, {});
  all[user.email] = [entry, ...(all[user.email] || []).filter(r => r.sessionId !== entry.sessionId)].slice(0, MAX_ROUNDS);
  writeJson(ROUNDS_KEY, all);
}
