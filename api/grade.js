import { handle, HttpError, str } from './_groq.js';
import { loadChallenge, scoreResults } from './_lib/challenges.js';
import { grade } from './_lib/grader.js';
import { proofFor } from './_lib/auth.js';

// POST /api/grade { challengeId, files } -> runs the hidden tests in an isolated sandbox.
// The browser never holds the hidden tests; the proof lets /api/assess trust these results.
export default (req, res) => handle(req, res, async (body, { user }) => {
  const challenge = loadChallenge(str(body.challengeId, 80, 'challengeId'));
  if (challenge.runner !== 'suite') throw new HttpError(400, 'This challenge is graded in the browser.');
  const files = {};
  for (const [path, content] of Object.entries(body.files && typeof body.files === 'object' ? body.files : {}).slice(0, 40)) {
    if (/^\/|\.\./.test(path) || path.length > 120) continue;
    files[path] = str(content, 60000, 'file');
  }
  if (!Object.keys(files).length) throw new HttpError(400, 'No files to grade.');
  const { status, tests } = await grade({ files, hidden: challenge.hidden });
  if (!tests) return { status, tests: null, diagnostic: status === 'timeout' ? 'The tests did not finish in time (possible infinite loop).' : 'The test run failed.' };
  const score = scoreResults(challenge, tests);
  return { status, tests, score, proof: proofFor(user.email, { c: challenge.id, t: tests }) };
}, { limit: 6 });
