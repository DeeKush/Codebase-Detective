// Runs the fixed tests in a throwaway Web Worker; a hung or looping candidate is killed on timeout.
// mode 'visible' runs the test files the candidate can see; 'final' swaps in the pristine hidden tests.
export function runTests(files, challenge, mode = 'visible', timeoutMs = 10000) {
  const startedAt = Date.now();
  return new Promise(resolve => {
    const worker = new Worker(new URL('./runner.worker.js', import.meta.url), { type: 'module' });
    const finish = result => { clearTimeout(timer); worker.terminate(); resolve({ id: crypto.randomUUID(), startedAt, finishedAt: Date.now(), ...result }); };
    const timer = setTimeout(() => finish({ status: 'timeout', tests: null, diagnostic: 'Tests exceeded the time limit (possible infinite loop).' }), timeoutMs);
    worker.onmessage = ({ data }) => finish(data);
    worker.onerror = event => finish({ status: 'failed', tests: null, diagnostic: event.message || 'Runner crashed.' });
    const suite = challenge?.runner === 'suite'
      ? { files: mode === 'final' ? { ...files, ...challenge.hidden } : files, testFiles: mode === 'final' ? Object.keys(challenge.hidden) : challenge.visibleTests }
      : null;
    worker.postMessage({ files, suite });
  });
}
