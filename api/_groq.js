import fs from 'node:fs';
import path from 'node:path';

function loadEnv() {
  if (process.env.GROQ_API_KEY) return;
  for (const f of ['.env.local', '.env', '../.env.local', '../.env']) {
    try {
      const p = path.resolve(process.cwd(), f);
      if (fs.existsSync(p)) {
        if (typeof process.loadEnvFile === 'function') {
          process.loadEnvFile(p);
        } else {
          const text = fs.readFileSync(p, 'utf8');
          for (const line of text.split('\n')) {
            const m = line.match(/^\s*([A-Za-z_0-9]+)\s*=\s*(.*)?\s*$/);
            if (m && !process.env[m[1]]) {
              process.env[m[1]] = (m[2] || '').trim().replace(/^['"]|['"]$/g, '');
            }
          }
        }
        if (process.env.GROQ_API_KEY) break;
      }
    } catch { }
  }
}
loadEnv();

const CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

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

export async function handle(req, res, fn) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });
  try { res.status(200).json(await fn(req.body && typeof req.body === 'object' ? req.body : {})); }
  catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal error.' }); }
}

export const str = (value, max, name) => {
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be a string.`);
  if (value.length > max) throw new HttpError(400, `${name} is too large.`);
  return value;
};
