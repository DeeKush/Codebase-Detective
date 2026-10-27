import './_lib/env.js';

const CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

import { HttpError, str, rateLimited, clientIp } from './_lib/http.js';
import { requireUser, assertSameOrigin } from './_lib/auth.js';
export { HttpError, str };

const REASONS = { 401: 'Authentication failed. Check GROQ_API_KEY.', 402: 'Insufficient Groq credits.', 403: 'Access denied for this model.', 404: 'Model unavailable.', 413: 'Request too large.', 429: 'Rate limit reached. Retry shortly.' };

export async function callGroq({ system, messages, schema, maxTokens }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new HttpError(503, 'The assistant is not configured (missing GROQ_API_KEY).');
  const body = {
    model: MODEL,
    messages: [{ role: 'system', content: system }, ...messages],
    stream: false,
    max_completion_tokens: maxTokens ?? (schema ? 8192 : 6000),
    ...(schema ? {} : { reasoning_effort: 'low' }),
    ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'candidate_assessment', strict: true, schema } } } : {})
  };
  let response;
  try {
    response = await fetch(CHAT_URL, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(50000) });
  } catch {
    throw new HttpError(504, 'Could not reach Groq or the request timed out.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 502, `Groq HTTP ${response.status}: ${REASONS[response.status] || 'request failed.'}`);
  const choice = data?.choices?.[0];
  const text = choice?.message?.content;
  // Schema output is useless if cut off; a truncated chat answer is still worth showing.
  if (choice?.finish_reason === 'length' && (schema || typeof text !== 'string' || !text.trim())) throw new HttpError(502, 'The model ran out of room before answering. Try a shorter or more specific question.');
  if (typeof text !== 'string' || !text.trim()) throw new HttpError(502, 'Groq returned an empty response.');
  return text;
}

/** Wraps a POST handler: same-origin check, per-IP and per-user rate limits, optional login requirement, safe errors. */
export async function handle(req, res, fn, { auth = true, limit = 30 } = {}) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });
  try {
    assertSameOrigin(req);
    if (rateLimited(clientIp(req), { limit })) throw new HttpError(429, 'Too many requests. Wait a minute and try again.');
    const user = auth ? requireUser(req) : null;
    if (user && rateLimited(`user:${user.email}`, { limit })) throw new HttpError(429, 'Too many requests. Wait a minute and try again.');
    res.status(200).json(await fn(req.body && typeof req.body === 'object' ? req.body : {}, { user, req, res }));
  } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal error.' }); }
}

export { rateLimited };
