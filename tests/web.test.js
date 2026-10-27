import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCases } from '../src/harness.js';
import { score } from '../src/score.js';

const dir = new URL('../src/challenges/retry-queue/files/', import.meta.url);
const files = Object.fromEntries(['queue.js', 'worker.js', 'retryPolicy.js'].map(f => [f, fs.readFileSync(new URL(f, dir), 'utf8')]));

// Same loader logic as src/runner.worker.js.
function loadQueue(files) {
  const cache = {};
  const load = name => {
    if (cache[name]) return cache[name].exports;
    const module = { exports: {} }; cache[name] = module;
    new Function('module', 'exports', 'require', files[name])(module, module.exports, r => load(r.replace(/^\.\//, '').replace(/(\.js)?$/, '.js')));
    return module.exports;
  };
  return load('queue.js').RetryQueue;
}

test('browser harness matches the packaged Node harness on the starter', async () => {
  const tests = await runCases(loadQueue(files));
  // The original harness require()s CommonJS, so run it against a copy outside this ES-module package.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-'));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(tmp, name), content);
  const expected = JSON.parse(execFileSync(process.execPath, [new URL('./fixtures/harness.cjs', import.meta.url).pathname, tmp])).tests;
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.deepEqual(tests.map(t => [t.id, t.outcome]), expected.map(t => [t.id, t.outcome]));
  assert.ok(score(tests, 'completed'));
});

test('a load error fails every test instead of crashing', async () => {
  const tests = await runCases(undefined, new Error('boom'));
  assert.equal(tests.length, 5);
  assert.ok(tests.every(t => t.outcome === 'failed'));
});

async function call(handler, body, fetchImpl) {
  process.env.GROQ_API_KEY = 'test-key';
  globalThis.fetch = fetchImpl;
  let out;
  const res = { status(code) { out = { code }; return this; }, json(data) { out.data = data; } };
  await handler.default({ method: 'POST', body }, res);
  return out;
}
const groqReply = content => async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content } }] }) });

test('chat route returns the model answer and rejects oversize input', async () => {
  const chat = await import('../api/chat.js');
  const ok = await call(chat, { mode: 'explain', question: 'why?', file: 'queue.js', code: 'x' }, groqReply('because'));
  assert.equal(ok.code, 200);
  assert.equal(ok.data.answer, 'because');
  const bad = await call(chat, { question: 'x'.repeat(2001) }, groqReply('no'));
  assert.equal(bad.code, 400);
});

test('assess route validates scores and evidence ids', async () => {
  const assess = await import('../api/assess.js');
  const body = { answers: { rootCause: 'timer not cleared' }, baseline: { 'queue.js': 'a' }, files: { 'queue.js': 'b' }, narration: [{ t: 12, text: 'I suspect the retry timer' }], chat: [{ t: 30, mode: 'investigate', question: 'q', answer: 'a' }] };
  const criteria = ids => ['codeReading', 'debugging', 'aiFluency', 'communication'].map(id => ({ id, points: 5, rationale: 'r', evidenceIds: ids, confidence: 'low' }));
  const reply = (ids, extra = {}) => groqReply(JSON.stringify({ criteria: criteria(ids), strengths: [], improvements: [], exercises: [], summary: 's', limitations: [], ...extra }));
  const ok = await call(assess, body, reply(['diff:queue.js', 'narration:0', 'chat:0']));
  assert.equal(ok.code, 200);
  assert.equal(ok.data.report.overallScore, 20);
  assert.equal((await call(assess, body, reply(['invented']))).code, 502);
  const tooHigh = criteria(['diff:queue.js']); tooHigh[0].points = 26;
  assert.equal((await call(assess, body, groqReply(JSON.stringify({ criteria: tooHigh, strengths: [], improvements: [], exercises: [], summary: 's', limitations: [] })))).code, 502);
});

test('every challenge has files, three phases and a real entry file', async () => {
  const dir = new URL('../src/challenges/', import.meta.url);
  for (const id of fs.readdirSync(dir).filter(n => fs.statSync(new URL(n, dir)).isDirectory())) {
    const meta = JSON.parse(fs.readFileSync(new URL(`${id}/meta.json`, dir), 'utf8'));
    assert.equal(meta.phases.length, 3, id);
    assert.ok(fs.existsSync(new URL(`${id}/files/${meta.entry}`, dir)), `${id} entry ${meta.entry}`);
  }
});

test('the API rate limit blocks a burst from one client and not another', async () => {
  const { rateLimited } = await import('../api/_groq.js');
  const now = 1_000_000;
  const results = Array.from({ length: 31 }, () => rateLimited('1.2.3.4', { limit: 30, now }));
  assert.equal(results.slice(0, 30).some(Boolean), false);
  assert.equal(results[30], true);
  assert.equal(rateLimited('5.6.7.8', { limit: 30, now }), false);
  assert.equal(rateLimited('1.2.3.4', { limit: 30, now: now + 61000 }), false);
});
