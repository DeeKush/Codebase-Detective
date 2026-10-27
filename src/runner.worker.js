import { runCases } from './harness.js';
import { runSuite } from './testkit.js';

// Minimal CommonJS loader so the candidate's files can require() each other.
function loadModules(files) {
  const cache = {};
  const load = name => {
    if (cache[name]) return cache[name].exports;
    if (!(name in files)) throw new Error(`Cannot find module '${name}'`);
    const module = { exports: {} };
    cache[name] = module;
    new Function('module', 'exports', 'require', files[name])(module, module.exports, request => load(request.replace(/^\.\//, '').replace(/(\.js)?$/, '.js')));
    return module.exports;
  };
  return load;
}

self.onmessage = async ({ data: { files, suite } }) => {
  try {
    if (suite) { self.postMessage({ status: 'completed', tests: await runSuite(suite) }); return; }
    let RetryQueue, loadError;
    try { ({ RetryQueue } = loadModules(files)('queue.js')); } catch (error) { loadError = error; }
    self.postMessage({ status: 'completed', tests: await runCases(RetryQueue, loadError) });
  } catch (error) { self.postMessage({ status: 'failed', tests: null, diagnostic: String(error.message || error) }); }
};
