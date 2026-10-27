// Mocha-style runner, CommonJS loader and assert shim. Runs unchanged OSS test suites in a Web Worker
// and in Node (the ingest pipeline validates bundles with this exact code, so browser and CLI agree).

class AssertionError extends Error {
  constructor(message, extra = {}) { super(message); this.name = 'AssertionError'; this.code = 'ERR_ASSERTION'; Object.assign(this, extra); }
}
const show = v => { try { return typeof v === 'string' ? JSON.stringify(v) : v instanceof RegExp || typeof v === 'function' ? String(v) : JSON.stringify(v) ?? String(v); } catch { return String(v); } };
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function deep(a, b, strict) {
  if (strict ? Object.is(a, b) : (a == b || (a !== a && b !== b))) return true; // eslint-disable-line eqeqeq
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp && b instanceof RegExp) return String(a) === String(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => hasOwn(b, k) && deep(a[k], b[k], strict));
}

function matches(error, expected) {
  if (expected === undefined || typeof expected === 'string') return true;
  if (expected instanceof RegExp) return expected.test(String(error));
  if (typeof expected === 'function') return expected.prototype !== undefined && error instanceof expected ? true : Error.isPrototypeOf(expected) ? false : expected.call({}, error) === true;
  return Object.keys(expected).every(k => expected[k] instanceof RegExp ? expected[k].test(String(error?.[k])) : deep(error?.[k], expected[k], true));
}

export function makeAssert() {
  const fail = (message, fallback) => { throw message instanceof Error ? message : new AssertionError(message || fallback); };
  const assert = (value, message) => { if (!value) fail(message, `The expression evaluated to a falsy value: ${show(value)}`); };
  Object.assign(assert, {
    AssertionError,
    ok: assert,
    fail: message => fail(message, 'Failed'),
    equal: (a, b, m) => { if (!(a == b || (a !== a && b !== b))) fail(m, `${show(a)} == ${show(b)}`); }, // eslint-disable-line eqeqeq
    notEqual: (a, b, m) => { if (a == b) fail(m, `${show(a)} != ${show(b)}`); }, // eslint-disable-line eqeqeq
    strictEqual: (a, b, m) => { if (!Object.is(a, b)) fail(m, `Expected values to be strictly equal:\n  actual:   ${show(a)}\n  expected: ${show(b)}`); },
    notStrictEqual: (a, b, m) => { if (Object.is(a, b)) fail(m, `Expected "actual" to be strictly unequal to ${show(b)}`); },
    deepEqual: (a, b, m) => { if (!deep(a, b, false)) fail(m, `Expected values to be loosely deep-equal:\n  actual:   ${show(a)}\n  expected: ${show(b)}`); },
    deepStrictEqual: (a, b, m) => { if (!deep(a, b, true)) fail(m, `Expected values to be strictly deep-equal:\n  actual:   ${show(a)}\n  expected: ${show(b)}`); },
    notDeepEqual: (a, b, m) => { if (deep(a, b, false)) fail(m, 'Expected values not to be loosely deep-equal'); },
    notDeepStrictEqual: (a, b, m) => { if (deep(a, b, true)) fail(m, 'Expected values not to be strictly deep-equal'); },
    ifError: e => { if (e !== null && e !== undefined) throw e; },
    match: (s, re, m) => { if (!re.test(s)) fail(m, `${show(s)} does not match ${show(re)}`); },
    throws(fn, expected, message) {
      let threw = false, error;
      try { fn(); } catch (e) { threw = true; error = e; }
      if (!threw) fail(typeof expected === 'string' ? expected : message, 'Missing expected exception.');
      if (!matches(error, expected)) throw error;
    },
    doesNotThrow(fn, message) { try { fn(); } catch (e) { fail(typeof message === 'string' ? message : undefined, `Got unwanted exception: ${e?.message ?? e}`); } },
    async rejects(promiseOrFn, expected) {
      try { await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn); } catch (e) { if (!matches(e, expected)) throw e; return; }
      fail(undefined, 'Missing expected rejection.');
    }
  });
  assert.strict = assert;
  return assert;
}

const dirname = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
function normalize(path) {
  const out = [];
  for (const part of path.split('/')) { if (part === '' || part === '.') continue; if (part === '..') out.pop(); else out.push(part); }
  return out.join('/');
}

/** Returns require(request, fromFile) for a {path: source} map. Only `assert` is available as a built-in. */
export function createLoader(files, { process: proc } = {}) {
  const cache = {}, assert = makeAssert();
  const processShim = proc || { env: {}, platform: 'browser', version: 'v20.0.0', versions: {}, argv: [], nextTick: (fn, ...a) => queueMicrotask(() => fn(...a)), emitWarning() {}, cwd: () => '/' };
  const resolve = (request, from) => {
    const base = normalize(`${dirname(from)}/${request}`);
    const join = name => base ? `${base}/${name}` : name;
    for (const candidate of [base, `${base}.js`, `${base}.json`, join('index.js'), join('package.json')]) {
      if (candidate in files) {
        if (candidate.endsWith('package.json') && !request.endsWith('package.json')) {
          const main = JSON.parse(files[candidate]).main;
          const target = normalize(`${dirname(candidate)}/${main || 'index.js'}`);
          for (const m of [target, `${target}.js`]) if (m in files) return m;
          continue;
        }
        return candidate;
      }
    }
    throw new Error(`Cannot find module '${request}'`);
  };
  const makeRequire = from => {
    const req = request => {
      if (request === 'assert' || request === 'node:assert' || request === 'assert/strict') return assert;
      if (!request.startsWith('.') && !request.startsWith('/')) throw new Error(`Cannot find module '${request}' (only relative files and assert are available)`);
      return load(resolve(request, from));
    };
    req.resolve = request => resolve(request, from);
    return req;
  };
  const load = (path) => {
    if (cache[path]) return cache[path].exports;
    if (path.endsWith('.json')) return (cache[path] = { exports: JSON.parse(files[path]) }).exports;
    const module = { exports: {}, id: path, filename: path };
    cache[path] = module;
    const req = makeRequire(path);
    new Function('module', 'exports', 'require', '__filename', '__dirname', 'process', 'global', files[path])(module, module.exports, req, path, dirname(path), processShim, globalThis);
    return module.exports;
  };
  return { load, resolve, assert, require: makeRequire };
}

const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timeout of ${ms}ms exceeded in ${label}`)), ms);
  promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
});
const callHook = (fn, ctx) => fn.length > 0
  ? new Promise((resolve, reject) => { const r = fn.call(ctx, e => e ? reject(e instanceof Error ? e : new Error(String(e))) : resolve()); if (r && typeof r.then === 'function') r.then(resolve, reject); })
  : Promise.resolve(fn.call(ctx));

function newSuite(title, parent) { return { title, parent, suites: [], tests: [], before: [], after: [], beforeEach: [], afterEach: [] }; }

/**
 * Runs mocha-style test files. Returns [{id, outcome: 'passed'|'failed', message}] where id is the full title joined by " > ".
 * `skip` is a set of ids that are neither run nor reported.
 */
export async function runSuite({ files, testFiles, skip = [], testTimeoutMs = 2000 }) {
  const loader = createLoader(files);
  const root = newSuite('', null);
  let current = root;
  const describe = (title, fn) => { const suite = newSuite(title, current); current.suites.push(suite); const prev = current; current = suite; try { fn.call({ timeout() {}, slow() {} }); } finally { current = prev; } };
  describe.skip = () => {}; describe.only = describe;
  const it = (title, fn) => { if (typeof fn === 'function') current.tests.push({ title, fn, suite: current }); };
  it.skip = () => {}; it.only = it;
  const hooks = { before: (fn) => current.before.push(fn), after: (fn) => current.after.push(fn), beforeEach: (fn) => current.beforeEach.push(fn), afterEach: (fn) => current.afterEach.push(fn) };
  const globals = { describe, context: describe, it, specify: it, xit: it.skip, xdescribe: describe.skip, ...hooks };
  const loadErrors = [];
  for (const file of testFiles) {
    try {
      const module = { exports: {} };
      const req = loader.require(file);
      const wrapped = new Function('module', 'exports', 'require', '__filename', '__dirname', 'process', 'global', ...Object.keys(globals), files[file]);
      wrapped(module, module.exports, req, file, dirname(file), { env: {}, platform: 'browser', nextTick: fn => queueMicrotask(fn) }, globalThis, ...Object.values(globals));
    } catch (error) { loadErrors.push({ id: `(load) ${file}`, outcome: 'failed', message: `Cannot load test file ${file}: ${error.message}`.slice(0, 1000) }); }
  }

  const results = [...loadErrors];
  const skipSet = new Set(skip);
  const idOf = test => { const parts = [test.title]; for (let s = test.suite; s && s.parent; s = s.parent) parts.unshift(s.title); return parts.join(' > '); };
  const chain = suite => { const list = []; for (let s = suite; s; s = s.parent) list.unshift(s); return list; };

  async function runSuiteNode(suite) {
    const ctx = { timeout() {}, slow() {} };
    const tests = suite.tests.filter(t => !skipSet.has(idOf(t)));
    let hookFailure = null;
    const guarded = async (fns) => { for (const fn of fns) { try { await withTimeout(callHook(fn, ctx), testTimeoutMs, 'hook'); } catch (e) { hookFailure ||= e; } } };
    if (tests.length || suite.suites.length) await guarded(suite.before);
    for (const test of tests) {
      let error = hookFailure;
      if (!error) {
        try {
          for (const s of chain(suite)) for (const fn of s.beforeEach) await withTimeout(callHook(fn, ctx), testTimeoutMs, 'beforeEach hook');
          await withTimeout(callHook(test.fn, ctx), testTimeoutMs, 'test');
        } catch (e) { error = e; }
        try { for (const s of chain(suite).reverse()) for (const fn of s.afterEach) await withTimeout(callHook(fn, ctx), testTimeoutMs, 'afterEach hook'); } catch (e) { error ||= e; }
      }
      results.push({ id: idOf(test), outcome: error ? 'failed' : 'passed', message: error ? String(error.message ?? error).slice(0, 1000) : '' });
    }
    for (const child of suite.suites) await runSuiteNode(child);
    await guarded(suite.after);
  }
  await runSuiteNode(root);
  return results;
}
