import { HttpError } from './_lib/http.js';
import { requireUser, assertSameOrigin } from './_lib/auth.js';
import { getStore } from './_lib/store.js';

const MAX_SESSION_BYTES = 600_000;

function checkSession(s) {
  if (!s || typeof s !== 'object' || typeof s.challengeId !== 'string' || typeof s.id !== 'string' || !s.files || typeof s.files !== 'object') throw new HttpError(400, 'Invalid session.');
  if (Object.values(s.files).some(v => typeof v !== 'string')) throw new HttpError(400, 'Invalid session files.');
  if (JSON.stringify(s).length > MAX_SESSION_BYTES) throw new HttpError(413, 'Session is too large to save.');
}

// GET    /api/state            -> { session, rounds }   the signed-in user's in-progress round and finished rounds
// PUT    /api/state            -> save the in-progress round
// DELETE /api/state            -> discard it
export default async function handler(req, res) {
  try {
    const user = requireUser(req), store = getStore();
    if (req.method !== 'GET') assertSameOrigin(req);
    if (req.method === 'GET') {
      const [session, rounds] = await Promise.all([store.get(`session:${user.email}`), store.get(`rounds:${user.email}`)]);
      return res.status(200).json({ session: session ? JSON.parse(session) : null, rounds: rounds ? JSON.parse(rounds) : [] });
    }
    if (req.method === 'PUT') {
      const session = req.body?.session;
      checkSession(session);
      await store.set(`session:${user.email}`, JSON.stringify(session));
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') { await store.del(`session:${user.email}`); return res.status(200).json({ ok: true }); }
    throw new HttpError(405, 'Method not allowed.');
  } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal error.' }); }
}
