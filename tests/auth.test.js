import test from 'node:test';
import assert from 'node:assert/strict';

const data = new Map();
globalThis.localStorage = { getItem: k => data.has(k) ? data.get(k) : null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
const auth = await import('../src/auth.js');

test('sign up, log out, log in', async () => {
  assert.equal(auth.currentUser(), null);
  const user = await auth.signUp({ name: ' Ada ', email: 'Ada@Example.com', password: 'correct horse' });
  assert.deepEqual(user, { email: 'ada@example.com', name: 'Ada' });
  assert.equal(auth.currentUser().email, 'ada@example.com');
  auth.logOut();
  assert.equal(auth.currentUser(), null);
  assert.equal((await auth.logIn({ email: 'ADA@example.com', password: 'correct horse' })).name, 'Ada');
});

test('passwords are never stored in plain text', () => {
  const raw = [...data.values()].join('|');
  assert.ok(!raw.includes('correct horse'));
});

test('rejects duplicates, wrong passwords, unknown accounts and weak input with clear messages', async () => {
  await assert.rejects(auth.signUp({ name: 'Ada', email: 'ada@example.com', password: 'another one 1' }), /already exists/);
  await assert.rejects(auth.logIn({ email: 'ada@example.com', password: 'wrong password' }), /incorrect/);
  await assert.rejects(auth.logIn({ email: 'nobody@example.com', password: 'whatever123' }), /incorrect/);
  await assert.rejects(auth.signUp({ name: 'B', email: 'not-an-email', password: 'longenough' }), /valid email/);
  await assert.rejects(auth.signUp({ name: 'B', email: 'b@example.com', password: 'short' }), /8 characters/);
  await assert.rejects(auth.signUp({ name: '', email: 'b@example.com', password: 'longenough' }), /name/);
});

test('rounds are kept per user and deduplicated by session', async () => {
  await auth.logIn({ email: 'ada@example.com', password: 'correct horse' });
  auth.recordRound({ sessionId: 's1', title: 'LRU Cache', score: 61 });
  auth.recordRound({ sessionId: 's1', title: 'LRU Cache', score: 70 });
  assert.deepEqual(auth.rounds().map(r => r.score), [70]);
  await auth.signUp({ name: 'Bo', email: 'bo@example.com', password: 'another pass' });
  assert.deepEqual(auth.rounds(), []);
});
