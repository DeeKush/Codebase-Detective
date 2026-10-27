import { HttpError, rateLimited, clientIp } from '../_lib/http.js';
import { signUp, logIn, signToken, sessionCookie, clearCookie, currentUser, assertSameOrigin, oauthCookie, clearOauthCookie, oauthState, signInWithGoogle } from '../_lib/auth.js';
import { googleEnabled, authorizationUrl, newState, profileFromCode } from '../_lib/google.js';

// POST /api/auth/signup | login | logout     GET /api/auth/me | config | google | google-callback
export default async function handler(req, res) {
  const action = req.query?.action;
  try {
    if (action === 'config') return res.status(200).json({ google: googleEnabled() });
    if (action === 'google') {
      const state = newState();
      res.setHeader('Set-Cookie', oauthCookie(signToken({ st: state }, 600)));
      res.setHeader('Location', authorizationUrl(req, state));
      return res.status(302).end();
    }
    if (action === 'google-callback') return await googleCallback(req, res);
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

// Always ends in a redirect to the app, with ?auth_error=<code> when something went wrong, so the user never sees raw JSON.
async function googleCallback(req, res) {
  const fail = code => { res.setHeader('Set-Cookie', clearOauthCookie()); res.setHeader('Location', `/?auth_error=${code}`); return res.status(302).end(); };
  const { code, state, error } = req.query || {};
  if (error) return fail(error === 'access_denied' ? 'google_denied' : 'google_failed');
  const saved = oauthState(req);
  if (!code || !state || !saved || saved.st !== state) return fail('google_state');
  try {
    const user = await signInWithGoogle(await profileFromCode(req, String(code)));
    res.setHeader('Set-Cookie', [clearOauthCookie(), sessionCookie(signToken({ sub: user.email, name: user.name }))]);
    res.setHeader('Location', '/');
    return res.status(302).end();
  } catch { return fail('google_failed'); }
}
