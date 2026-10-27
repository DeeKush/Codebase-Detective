import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './http.js';

// Server-side view of a challenge bundle: includes the hidden tests, the reference fix and grading data that the browser never receives.
const ROOT = path.resolve(process.cwd(), 'src/challenges');

function readTree(dir) {
  const out = {};
  const walk = (d, prefix) => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(d, entry.name), `${prefix}${entry.name}/`);
      else out[prefix + entry.name] = fs.readFileSync(path.join(d, entry.name), 'utf8');
    }
  };
  walk(dir, '');
  return out;
}

export function loadChallenge(id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(id)) throw new HttpError(400, 'Unknown challenge.');
  const dir = path.join(ROOT, id);
  if (!fs.existsSync(path.join(dir, 'meta.json'))) throw new HttpError(404, 'Unknown challenge.');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const grading = fs.existsSync(path.join(dir, 'grading.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'grading.json'), 'utf8')) : {};
  return {
    ...meta, failToPass: grading.failToPass || [],
    files: readTree(path.join(dir, 'files')), hidden: readTree(path.join(dir, 'hidden')),
    reference: fs.existsSync(path.join(dir, 'reference.patch')) ? fs.readFileSync(path.join(dir, 'reference.patch'), 'utf8') : ''
  };
}

const FAIL_TO_PASS_WEIGHT = 3; // a test that exposes the bug counts three times a regression guard
export function scoreResults(challenge, tests) {
  const weight = id => challenge.failToPass.includes(id) ? FAIL_TO_PASS_WEIGHT : 1;
  const totalPoints = tests.reduce((n, t) => n + weight(t.id), 0);
  const passedPoints = tests.filter(t => t.outcome === 'passed').reduce((n, t) => n + weight(t.id), 0);
  return { passedPoints, totalPoints, correctness: totalPoints ? Math.round(3500 * passedPoints / totalPoints) / 100 : 0 };
}
