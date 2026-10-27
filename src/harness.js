// Ported from challenges/retry-queue-v1/harness.js for the browser worker.
export async function runCases(RetryQueue, loadError) {
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function observe(makeQueue, job, delay = 90) {
  const events = [], queue = makeQueue();
  queue.onEvent(event => events.push(event));
  queue.enqueue(job); await wait(delay);
  return { queue, events };
}
const cases = [
  ['success', async () => { let calls = 0; const {queue} = await observe(() => new RetryQueue({ work: async () => { calls++; return 7; } }, {baseDelayMs: 2}), {id:'s',kind:'work'}); if (calls !== 1 || queue.status('s').state !== 'done') throw Error(`expected one completion, got ${calls}`); }],
  ['retry', async () => { let calls = 0; const {queue} = await observe(() => new RetryQueue({work:async()=>{ if (++calls === 1) throw Error('transient'); }}, {baseDelayMs: 5}), {id:'r',kind:'work'}); if (calls !== 2 || queue.status('r').state !== 'done') throw Error(`expected two attempts, got ${calls}`); }],
  ['overlap', async () => { let calls = 0, active = 0, peak = 0; const {queue} = await observe(() => new RetryQueue({work:async()=>{ active++; peak=Math.max(peak,active); await wait(3); active--; if (++calls === 1) throw Error('transient'); }}, {baseDelayMs: 30}), {id:'o',kind:'work'}, 120); if (calls !== 2 || peak !== 1 || queue.status('o').state !== 'done') throw Error(`expected two sequential calls, got ${calls}; peak ${peak}`); }],
  ['exhaustion', async () => { let calls = 0; const {queue} = await observe(() => new RetryQueue({work:async()=>{calls++; throw Error('permanent');}}, {maxAttempts:2,baseDelayMs:5}), {id:'e',kind:'work'}); if (calls !== 2 || queue.status('e').state !== 'failed') throw Error(`expected two attempts then failure, got ${calls}`); }],
  ['duplicate', async () => { const queue = new RetryQueue({work:async()=>{}}); queue.enqueue({id:'d',kind:'work'}); try { queue.enqueue({id:'d',kind:'work'}); throw Error('duplicate accepted'); } catch (error) { if (error.message === 'duplicate accepted') throw error; } }]
];
  const tests = [];
  for (const [id, fn] of cases) {
    if (loadError) { tests.push({id,outcome:'failed',message:`Cannot load candidate queue: ${loadError.message}`.slice(0,1000)}); continue; }
    try { await fn(); tests.push({id,outcome:'passed',message:''}); }
    catch (error) { tests.push({id,outcome:'failed',message:String(error.message).slice(0,1000)}); }
  }
  return tests;
}
