import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { HttpError } from './http.js';

const TIMEOUT_MS = 20000;
const trim = results => results.slice(0, 200).map(t => ({ id: String(t.id).slice(0, 200), outcome: t.outcome === 'passed' ? 'passed' : 'failed' })); // messages are dropped on purpose: they could leak hidden test source

// Production: run the candidate's code in a throwaway Firecracker microVM with no network and none of our secrets.
async function inSandbox({ files, testFiles }) {
  const { Sandbox } = await import('@vercel/sandbox');
  const kit = fs.readFileSync(path.resolve(process.cwd(), 'src/testkit.js'), 'utf8');
  const runner = "import fs from 'node:fs'; import { runSuite } from './testkit.mjs'; const spec = JSON.parse(fs.readFileSync('/vercel/sandbox/spec.json', 'utf8')); runSuite(spec).then(r => console.log('@@RESULT@@' + JSON.stringify(r)));";
  let sandbox;
  try {
    sandbox = await Sandbox.create({ runtime: 'node22', resources: { vcpus: 1 }, timeout: 60000, persistent: false, networkPolicy: 'deny-all' });
    await sandbox.writeFiles([
      { path: 'testkit.mjs', content: Buffer.from(kit) }, { path: 'run.mjs', content: Buffer.from(runner) },
      { path: 'spec.json', content: Buffer.from(JSON.stringify({ files, testFiles })) }
    ]);
    const run = await sandbox.runCommand({ cmd: 'timeout', args: ['15', 'node', '/vercel/sandbox/run.mjs'], cwd: '/vercel/sandbox' });
    if (run.exitCode === 124) return { status: 'timeout', results: null };
    const out = await run.stdout(), marker = out.lastIndexOf('@@RESULT@@');
    if (run.exitCode !== 0 || marker < 0) return { status: 'failed', results: null };
    return { status: 'completed', results: JSON.parse(out.slice(marker + 10).split('\n')[0]) };
  } finally { await sandbox?.stop().catch(() => {}); }
}

// Development and tests only (GRADER=local): a worker thread with an empty environment. Not a security boundary.
function inWorker({ files, testFiles }) {
  return new Promise(resolve => {
    const worker = new Worker(new URL('./graderWorker.js', import.meta.url), { workerData: { files, testFiles }, env: {} });
    const timer = setTimeout(() => { worker.terminate(); resolve({ status: 'timeout', results: null }); }, TIMEOUT_MS);
    worker.on('message', m => { clearTimeout(timer); worker.terminate(); resolve(m.results ? { status: 'completed', results: m.results } : { status: 'failed', results: null }); });
    worker.on('error', () => { clearTimeout(timer); resolve({ status: 'failed', results: null }); });
  });
}

/** Runs the hidden tests against the candidate's files. Returns {status, tests}. */
export async function grade({ files, hidden }) {
  const spec = { files: { ...files, ...hidden }, testFiles: Object.keys(hidden) };
  let outcome;
  try { outcome = await (process.env.GRADER === 'local' ? inWorker(spec) : inSandbox(spec)); }
  catch { throw new HttpError(503, 'The grading service is unavailable. Your work is saved; try again in a moment.'); }
  return { status: outcome.status, tests: outcome.results ? trim(outcome.results) : null };
}
