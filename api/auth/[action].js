import { HttpError, rateLimited, clientIp } from '../_lib/http.js';
import { signUp, logIn, signToken, sessionCookie, clearCookie, currentUser, assertSameOrigin } from '../_lib/auth.js';

// POST /api/auth/signup | login | logout     GET /api/auth/me
export default async function handler(req, res) {
  const action = req.query?.action;
  try {
    if (action === 'me') {
      if (req.method !== 'GET') throw new HttpError(405, 'GET only.');
      return res.status(200).json({ user: currentUser(req) });
    }
    if (req.method !== 'POST') throw new HttpError(405, 'POST only.');
    assertSameOrigin(req);
    if (action === 'logout') { res.setHeader('Set-Cookie', clearCookie()); return res.status(200).json({ ok: true }); }
    if (action !== 'signup' && action !== 'login') throw new HttpError(404, 'Not found.');
    if (clientIp(req) && rateLimited(`auth:${clientIp(req)}`, { limit: 10 })) throw new HttpError(429, 'Too many attempts. Wait a minute and try again.');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const user = await (action === 'signup' ? signUp(body) : logIn(body));
    res.setHeader('Set-Cookie', sessionCookie(signToken({ sub: user.email, name: user.name })));
    return res.status(200).json({ user });
  } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal error.' }); }
}
