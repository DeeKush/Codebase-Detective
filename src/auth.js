// Client side of server-backed accounts. Passwords are sent over HTTPS to /api/auth and hashed there (scrypt);
// the browser only ever holds an HttpOnly session cookie, which scripts cannot read.
import { authRequest, fetchMe } from './api.js';

export class AuthError extends Error {}
export const normalizeEmail = email => String(email ?? '').trim().toLowerCase();

export function validate({ name, email, password }, { needName }) {
  if (needName && !String(name ?? '').trim()) return 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email))) return 'Enter a valid email address.';
  if (String(password ?? '').length < 8) return 'Use a password with at least 8 characters.';
  return '';
}

async function submit(action, form, needName) {
  const problem = validate(form, { needName });
  if (problem) throw new AuthError(problem);
  try { return (await authRequest(action, form)).user; }
  catch (error) { throw new AuthError(error.message); }
}
export const signUp = form => submit('signup', form, true);
export const logIn = form => submit('login', form, false);
export async function logOut() { try { await authRequest('logout', {}); } catch { /* the cookie also expires on its own */ } }
/** The signed-in user, or null (also null when the server is unreachable, which shows the login screen). */
export async function currentUser() { try { return (await fetchMe()).user; } catch { return null; } }
