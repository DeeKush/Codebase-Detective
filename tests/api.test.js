import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.STORE = 'memory'; process.env.GRADER = 'local'; process.env.AUTH_SECRET = 'test-secret-test-secret'; process.env.GROQ_API_KEY = 'test-key';
const auth = await import('../api/auth/[action].js');
const state = await import('../api/state.js');
const grade = await import('../api/grade.js');
const assess = await import('../api/assess.js');
const { proofFor } = await import('../api/_lib/auth.js');

function invoke(handler, { method = 'POST', body, headers = {}, query } = {}) {
  return new Promise(async resolve => {
    const out = { headers: {} };
    const res = { status(code) { out.code = code; return this; }, json(data) { out.data = data; resolve(out); }, setHeader(k, v) { out.headers[k] = v; } };
    await handler.default({ method, body, headers, query }, res);
  });
}
const cookieOf = out => out.headers['Set-Cookie'].split(';')[0];
const reply = content => { globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content } }] }) }); };

test('sign up sets an HttpOnly cookie, and the passwords are hashed in storage', async () => {
  const out = await invoke(auth, { query: { action: 'signup' }, body: { name: 'Ada', email: 'Ada@Example.com', password: 'correct horse' } });
  assert.equal(out.code, 200);
  assert.deepEqual(out.data.user, { email: 'ada@example.com', name: 'Ada' });
  assert.match(out.headers['Set-Cookie'], /HttpOnly/);
  assert.match(out.headers['Set-Cookie'], /SameSite=Lax/);
  const me = await invoke(auth, { method: 'GET', query: { action: 'me' }, headers: { cookie: cookieOf(out) } });
  assert.equal(me.data.user.name, 'Ada');
  const stored = await (await import('../api/_lib/store.js')).getStore().get('user:ada@example.com');
  assert.ok(!stored.includes('correct horse') && stored.includes('scrypt$'));
});

test('login failures are clear and identical for unknown accounts and wrong passwords', async () => {
  const wrong = await invoke(auth, { query: { action: 'login' }, body: { email: 'ada@example.com', password: 'wrong password' } });
  const unknown = await invoke(auth, { query: { action: 'login' }, body: { email: 'nobody@example.com', password: 'whatever123' } });
  assert.equal(wrong.code, 401); assert.equal(unknown.code, 401);
  assert.equal(wrong.data.error, unknown.data.error);
  assert.equal((await invoke(auth, { query: { action: 'signup' }, body: { name: 'Ada', email: 'ada@example.com', password: 'another one 1' } })).code, 409);
  assert.equal((await invoke(auth, { query: { action: 'signup' }, body: { name: 'B', email: 'nope', password: 'longenough' } })).code, 400);
  assert.equal((await invoke(auth, { query: { action: 'signup' }, body: { name: 'B', email: 'b@example.com', password: 'short' } })).code, 400);
  const ok = await invoke(auth, { query: { action: 'login' }, body: { email: 'ADA@example.com', password: 'correct horse' } });
  assert.equal(ok.code, 200);
});

test('cookies cannot be forged and cross-site writes are refused', async () => {
  const forged = await invoke(state, { method: 'GET', headers: { cookie: 'cd_session=eyJzdWIiOiJhZGFAZXhhbXBsZS5jb20ifQ.AAAA' } });
  assert.equal(forged.code, 401);
  const login = await invoke(auth, { query: { action: 'login' }, body: { email: 'ada@example.com', password: 'correct horse' } });
  const crossSite = await invoke(state, { method: 'PUT', body: { session: {} }, headers: { cookie: cookieOf(login), origin: 'https://evil.example', host: 'app.example' } });
  assert.equal(crossSite.code, 403);
});

test('a round is saved per user, restored, and invisible to other users', async () => {
  const ada = { cookie: cookieOf(await invoke(auth, { query: { action: 'login' }, body: { email: 'ada@example.com', password: 'correct horse' } })) };
  const bo = { cookie: cookieOf(await invoke(auth, { query: { action: 'signup' }, body: { name: 'Bo', email: 'bo@example.com', password: 'another pass' } })) };
  const session = { id: 's1', challengeId: 'lru-cache', files: { 'a.js': 'x' } };
  assert.equal((await invoke(state, { method: 'PUT', body: { session }, headers: ada })).code, 200);
  assert.deepEqual((await invoke(state, { method: 'GET', headers: ada })).data.session, session);
  assert.equal((await invoke(state, { method: 'GET', headers: bo })).data.session, null);
  assert.equal((await invoke(state, { method: 'PUT', body: { session: { id: 'x', challengeId: 'y', files: { a: 1 } } }, headers: ada })).code, 400);
  assert.equal((await invoke(state, { method: 'DELETE', headers: ada })).code, 200);
  assert.equal((await invoke(state, { method: 'GET', headers: ada })).data.session, null);
});

const challengeDir = new URL('../src/challenges/lru-cache/', import.meta.url);
const starter = () => Object.fromEntries(['src/lruCache.js', 'src/clock.js', 'src/index.js', 'test/lru-cache.test.js'].map(f => [f, fs.readFileSync(new URL(`files/${f}`, challengeDir), 'utf8')]));

test('hidden tests run on the server: the buggy starter fails them, the reference fix passes, and no test source is returned', async () => {
  const headers = { cookie: cookieOf(await invoke(auth, { query: { action: 'login' }, body: { email: 'ada@example.com', password: 'correct horse' } })) };
  const buggy = await invoke(grade, { body: { challengeId: 'lru-cache', files: starter() }, headers });
  assert.equal(buggy.code, 200);
  assert.ok(buggy.data.tests.some(t => t.outcome === 'failed'));
  assert.ok(buggy.data.tests.every(t => Object.keys(t).sort().join() === 'id,outcome'));
  assert.ok(buggy.data.score.correctness < 35);
  const fixedFiles = starter();
  fixedFiles['src/lruCache.js'] = fixedFiles['src/lruCache.js'].replace(/    if \(entry\.value\) \{\n      this\.entries\.delete\(key\);\n      this\.entries\.set\(key, entry\); \/\/ mark as most recently used\n    \}/, '    this.entries.delete(key);\n    this.entries.set(key, entry);');
  const fixed = await invoke(grade, { body: { challengeId: 'lru-cache', files: fixedFiles }, headers });
  assert.equal(fixed.data.score.correctness, 35);
  assert.equal((await invoke(grade, { body: { challengeId: '../etc', files: fixedFiles }, headers })).code, 400);
  assert.equal((await invoke(grade, { body: { challengeId: 'lru-cache', files: fixedFiles } })).code, 401);
});

test('a candidate cannot hit the grader with an infinite loop or fake their results', async () => {
  const headers = { cookie: cookieOf(await invoke(auth, { query: { action: 'login' }, body: { email: 'ada@example.com', password: 'correct horse' } })) };
  const looping = starter(); looping['src/lruCache.js'] = 'while (true) {}';
  const out = await invoke(grade, { body: { challengeId: 'lru-cache', files: looping }, headers });
  assert.equal(out.data.status, 'timeout');
  const tests = [{ id: 'LRUCache > x', outcome: 'passed' }];
  reply(JSON.stringify({ criteria: ['codeReading', 'debugging', 'aiFluency', 'communication'].map(id => ({ id, points: 5, rationale: 'r', evidenceIds: ['phase:0'], confidence: 'low' })), strengths: [], improvements: [], exercises: [], summary: 's', limitations: [] }));
  const body = { challengeId: 'lru-cache', sessionId: 'abc', minutes: 10, answers: {}, baseline: {}, files: {}, phases: [{ title: 'Bug Fix', status: 'completed', seconds: 60 }], tests };
  assert.equal((await invoke(assess, { body: { ...body, proof: 'forged' }, headers })).code, 400);
  const accepted = await invoke(assess, { body: { ...body, proof: proofFor('ada@example.com', { c: 'lru-cache', t: tests }) }, headers });
  assert.equal(accepted.code, 200);
  assert.equal(accepted.data.report.verified, true);
  const rounds = (await invoke(state, { method: 'GET', headers })).data.rounds;
  assert.equal(rounds[0].challengeId, 'lru-cache');
  assert.equal(rounds[0].minutes, 10);
});

test('hidden tests, the reference fix and bug-exposing test names are not in the browser bundle', () => {
  const dist = new URL('../dist/assets/', import.meta.url);
  if (!fs.existsSync(dist)) return;
  const bundle = fs.readdirSync(dist).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(new URL(f, dist), 'utf8')).join('\n');
  for (const secret of ['reading a falsy value still protects', 'nested ranges after a merge', 'parse ignores blank lines between rows', 'does not make the next handler miss']) {
    assert.ok(!bundle.includes(secret), `leaked: ${secret}`);
  }
});
