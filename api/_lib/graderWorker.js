import { parentPort, workerData } from 'node:worker_threads';
import { runSuite } from '../../src/testkit.js';

runSuite(workerData).then(results => parentPort.postMessage({ results }), error => parentPort.postMessage({ error: String(error?.message || error) }));
