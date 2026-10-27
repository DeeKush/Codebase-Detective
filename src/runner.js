// Runs the visible tests in a throwaway Web Worker; a hung or looping candidate is killed on timeout.
// Hidden tests run on the server (see api/grade.js).
export function runTests(files, challenge, timeoutMs = 10000) {
  const startedAt = Date.now();
  return new Promise(resolve => {
    const worker = new Worker(new URL('./runner.worker.js', import.meta.url), { type: 'module' });
    const finish = result => { clearTimeout(timer); worker.terminate(); resolve({ id: crypto.randomUUID(), startedAt, finishedAt: Date.now(), ...result }); };
    const timer = setTimeout(() => finish({ status: 'timeout', tests: null, diagnostic: 'Tests exceeded the time limit (possible infinite loop).' }), timeoutMs);
    worker.onmessage = ({ data }) => finish(data);
    worker.onerror = event => finish({ status: 'failed', tests: null, diagnostic: event.message || 'Runner crashed.' });
    const suite = challenge?.runner === 'suite'
      ? { files, testFiles: challenge.visibleTests }
      : null;
    worker.postMessage({ files, suite });
  });
}
