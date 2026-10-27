import test from 'node:test';
import assert from 'node:assert/strict';
import { runSuite } from '../src/testkit.js';
import { score, testPoints } from '../src/score.js';

const files = {
  'index.js': "module.exports = function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; };",
  'lib/util.js': "exports.double = n => n * 2;",
  'test/test.js': `
    var assert = require('assert'); var clamp = require('..'); var util = require('../lib/util');
    describe('clamp', function () {
      var calls = 0;
      beforeEach(function () { calls++; });
      it('keeps in-range values', function () { assert.strictEqual(clamp(5, 0, 10), 5); });
      it('clamps high', function () { assert.strictEqual(clamp(50, 0, 10), 10); });
      it('is wrong on purpose', function () { assert.strictEqual(clamp(-5, 0, 10), 99); });
      it('supports done callbacks', function (done) { setTimeout(done, 1); });
      it('supports promises', function () { return Promise.resolve().then(function () { assert.deepStrictEqual(util.double(2), 4); }); });
      it('checks throws', function () { assert.throws(function () { throw new TypeError('bad'); }, /bad/); });
      it('hooks ran', function () { assert.ok(calls > 0); });
    });`
};

test('runs mocha-style suites with hooks, done callbacks, promises and relative requires', async () => {
  const results = await runSuite({ files, testFiles: ['test/test.js'] });
  const byId = Object.fromEntries(results.map(r => [r.id, r.outcome]));
  assert.equal(byId['clamp > keeps in-range values'], 'passed');
  assert.equal(byId['clamp > is wrong on purpose'], 'failed');
  assert.equal(results.filter(r => r.outcome === 'passed').length, 6);
  assert.match(results.find(r => r.outcome === 'failed').message, /strictly equal/);
});

test('a missing module is reported as a load failure, not a crash', async () => {
  const results = await runSuite({ files: { 'test/t.js': "require('fs');" }, testFiles: ['test/t.js'] });
  assert.match(results[0].message, /Cannot find module 'fs'/);
});

test('skip omits tests and a hung test times out', async () => {
  const f = { 't.js': "describe('a', function () { it('x', function () {}); it('hang', function (done) {}); });" };
  const results = await runSuite({ files: f, testFiles: ['t.js'], skip: ['a > x'], testTimeoutMs: 30 });
  assert.deepEqual(results.map(r => [r.id, r.outcome]), [['a > hang', 'failed']]);
});

test('generic scoring weights bug-exposing tests three times', () => {
  const challenge = { runner: 'suite', failToPass: ['a > bug'] };
  assert.equal(testPoints(challenge, 'a > bug'), 3);
  const tests = [{ id: 'a > bug', outcome: 'failed' }, { id: 'a > ok', outcome: 'passed' }];
  assert.deepEqual(score(tests, 'completed', challenge), { passedPoints: 1, totalPoints: 4, correctness: 8.75 });
});
