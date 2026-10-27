import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runSuite } from '../src/testkit.js';

// Every authored or ingested "suite" challenge must be fair: visible tests pass, hidden tests catch the bug,
// and the reference patch fixes it. This is the same check the ingest pipeline applies to OSS bundles.
const base = fileURLToPath(new URL('../src/challenges/', import.meta.url));
const read = dir => {
  const out = {};
  const walk = (d, prefix) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name), `${prefix}${e.name}/`) : out[prefix + e.name] = fs.readFileSync(path.join(d, e.name), 'utf8'); };
  if (fs.existsSync(dir)) walk(dir, '');
  return out;
};

for (const id of fs.readdirSync(base).filter(n => fs.existsSync(path.join(base, n, 'meta.json')))) {
  const meta = JSON.parse(fs.readFileSync(path.join(base, id, 'meta.json'), 'utf8'));
  if (meta.runner !== 'suite') continue;
  const files = read(path.join(base, id, 'files')), hidden = read(path.join(base, id, 'hidden'));
  const failToPass = JSON.parse(fs.readFileSync(path.join(base, id, 'grading.json'), 'utf8')).failToPass;

  test(`${id}: visible tests all pass on the buggy code`, async () => {
    const results = await runSuite({ files, testFiles: meta.visibleTests });
    assert.ok(results.length >= 5);
    assert.deepEqual(results.filter(r => r.outcome !== 'passed'), []);
  });

  test(`${id}: hidden tests fail on the bug and only on the listed tests`, async () => {
    const results = await runSuite({ files: { ...files, ...hidden }, testFiles: Object.keys(hidden) });
    const failing = results.filter(r => r.outcome === 'failed').map(r => r.id).sort();
    assert.ok(failToPass.length > 0);
    assert.deepEqual(failing, [...failToPass].sort());
  });

  test(`${id}: the reference patch makes every hidden test pass`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-'));
    for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); }
    execFileSync('patch', ['-p1', '-d', dir, '-i', path.join(base, id, 'reference.patch')], { stdio: 'pipe' });
    const fixed = read(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    const results = await runSuite({ files: { ...fixed, ...hidden }, testFiles: Object.keys(hidden) });
    assert.deepEqual(results.filter(r => r.outcome !== 'passed'), []);
  });

  test(`${id}: the bug report does not leak the fix`, () => {
    const report = files['BUG_REPORT.md'] || '';
    assert.ok(report.length > 80);
    assert.ok(!/\b(fix|patch|should be changed|the cause|root cause)\b/i.test(report));
    assert.ok(!Object.values(files).some(t => /\bBUG\b/.test(t)));
  });
}
