#!/usr/bin/env node
// Challenge ingest pipeline: OSS repo -> validated, sanitized challenge bundle in src/challenges/<id>/.
//
//   node scripts/ingest.mjs scan  <repoUrl> [--work DIR]            list fix commits that make a valid challenge
//   node scripts/ingest.mjs build <repoUrl> <fixSha> [--work DIR]   write the bundle for one fix commit   (path A: real bug)
//   node scripts/ingest.mjs inject <repoUrl> [--seed N] [--work DIR] plant a bug in a healthy commit      (path B: injected bug)
//
// Bundles are written with reviewed:false. A human flips it to true after reading BUG_REPORT.md and reference.patch.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSuite } from '../src/testkit.js';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); if (i < 0) return fallback; const [, v] = args.splice(i, 2); return v; };
const WORK = flag('work', path.join(os.tmpdir(), 'cd-ingest'));
const SEED = Number(flag('seed', Date.now() % 100000));
const [command, repoUrl, shaArg] = args;

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
const JUNK = /^(\.git|\.github|node_modules|benchmark|coverage|\.nyc_output)(\/|$)|^(HISTORY|CHANGELOG|CHANGES|History|Changes)(\.md)?$|(^|\/)(\.travis\.yml|appveyor\.yml|\.eslintrc.*|\.eslintignore|\.gitignore|\.npmignore|\.editorconfig|package-lock\.json|yarn\.lock)$/;
const isTest = f => /^(test|tests|spec|__tests__)\//.test(f) && /\.js$/.test(f);
const isSource = f => /\.js$/.test(f) && !isTest(f) && !JUNK.test(f) && !/^(examples?|docs?|scripts?|bin)\//.test(f);

function clone(url) {
  const dir = path.join(WORK, url.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\//g, '__'));
  fs.mkdirSync(WORK, { recursive: true });
  if (!fs.existsSync(dir)) git(WORK, 'clone', '--quiet', '--no-tags', url, dir);
  return dir;
}

/** {path: content} for every small text file at a commit, minus junk that would leak the fix (history, changelogs). */
function snapshot(dir, sha) {
  const out = {};
  for (const f of git(dir, 'ls-tree', '-r', '--name-only', sha).split('\n').filter(Boolean)) {
    if (JUNK.test(f) || !/\.(js|json|md)$|^LICENSE/.test(f)) continue;
    const text = git(dir, 'show', `${sha}:${f}`);
    if (text.length < 120000 && !text.includes('\0')) out[f] = text;
  }
  return out;
}

const testFilesOf = files => Object.keys(files).filter(isTest);
async function run(files, testFiles, overrides = {}) {
  try { return await runSuite({ files: { ...files, ...overrides }, testFiles }); }
  catch (e) { return [{ id: '(crash)', outcome: 'failed', message: String(e.message) }]; }
}

/** Validation: buggy code fails >=1 hidden test, fixed code passes all of them, both runs execute. */
async function validate(dir, sha) {
  const parent = git(dir, 'rev-parse', `${sha}^`).trim();
  const buggy = snapshot(dir, parent), fixed = snapshot(dir, sha);
  const changed = git(dir, 'diff', '--name-only', parent, sha).split('\n').filter(Boolean);
  const src = changed.filter(isSource), tests = changed.filter(isTest);
  const reasons = [];
  if (!src.length || src.length > 2) reasons.push(`${src.length} source files changed`);
  if (!tests.length) reasons.push('no test change');
  if (reasons.length) return { ok: false, reasons };
  const patch = git(dir, 'diff', '--no-color', parent, sha, '--', ...src);
  const lines = patch.split('\n').filter(l => /^[+-][^+-]/.test(l)).length;
  if (lines > 40) return { ok: false, reasons: [`fix is ${lines} lines`] };
  const hiddenFiles = Object.fromEntries(testFilesOf(fixed).map(f => [f, fixed[f]]));
  const hiddenNames = testFilesOf(fixed);
  const onBuggy = await run(buggy, hiddenNames, hiddenFiles);
  const onFixed = await run(fixed, hiddenNames);
  const failToPass = onBuggy.filter(t => t.outcome === 'failed').map(t => t.id);
  const stillFailing = onFixed.filter(t => t.outcome === 'failed');
  if (onBuggy.some(t => t.id.startsWith('(load)') || t.id === '(crash)')) reasons.push(`tests do not load here: ${onBuggy.find(t => t.id.startsWith('(load)') || t.id === '(crash)').message.slice(0, 100)}`);
  if (!failToPass.length) reasons.push('no test fails before the fix');
  if (stillFailing.length) reasons.push(`${stillFailing.length} tests fail after the fix`);
  if (onFixed.length < 3) reasons.push('fewer than 3 tests');
  return { ok: !reasons.length, reasons, parent, buggy, fixed, src, tests, patch, lines, failToPass, total: onFixed.length, hiddenFiles };
}

function fixCommits(dir, limit = 500) {
  return git(dir, 'log', '--no-merges', `-n${limit}`, '--format=%H%x09%s').split('\n').filter(Boolean)
    .map(l => { const [sha, ...s] = l.split('\t'); return { sha, subject: s.join('\t') }; })
    .filter(c => /\b(fix|fixes|fixed|bug)\b/i.test(c.subject) && !/\b(typo|readme|docs?|lint|ci|travis|deps?|bump|release|perf)\b/i.test(c.subject));
}

async function scan() {
  const dir = clone(repoUrl), found = [];
  for (const c of fixCommits(dir)) {
    const v = await validate(dir, c.sha).catch(e => ({ ok: false, reasons: [String(e.message).slice(0, 80)] }));
    console.log(`${v.ok ? 'OK  ' : 'skip'} ${c.sha.slice(0, 8)} ${c.subject.slice(0, 70)}${v.ok ? `  [${v.lines} lines, ${v.failToPass.length}/${v.total} tests flip]` : `  (${v.reasons.join('; ')})`}`);
    if (v.ok) found.push(c.sha);
  }
  console.log(`\n${found.length} usable fix commit(s).`);
}

// ---- packaging -------------------------------------------------------------------------------------------------

function env() {
  const p = path.join(ROOT, '.env.local');
  const vars = {};
  if (fs.existsSync(p)) for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?/); if (m) vars[m[1]] = m[2]; }
  return { key: process.env.GROQ_API_KEY || vars.GROQ_API_KEY, model: process.env.GROQ_MODEL || vars.GROQ_MODEL || 'openai/gpt-oss-120b' };
}

/** Symptom-only bug report. Uses Groq when a key is configured; otherwise a neutral template a human must edit. */
async function bugReport({ name, subject, body, patch, testDiff }) {
  const { key, model } = env();
  const fallback = `Users of \`${name}\` report incorrect behaviour that matches this description: "${subject.replace(/^(fix(es|ed)?|bug)[:\s]+/i, '')}".\n\nFind the root cause in the source, fix it, and explain how you verified the fix. The existing tests pass, so they do not cover this case.`;
  if (!key) return { text: fallback, generated: false };
  const prompt = `Write a short bug report (3-5 sentences) as a user who hit this defect in the library "${name}". Describe only observable symptoms with a concrete example input and what was expected versus what happened. Do NOT mention the fix, the cause, line numbers, commit, or tests. Plain text, no headings.\n\nCommit subject: ${subject}\nCommit body: ${body.slice(0, 600)}\nFix diff (for your understanding only):\n${patch.slice(0, 3000)}\nTest diff:\n${testDiff.slice(0, 2000)}`;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model, temperature: 0.3, max_tokens: 600, messages: [{ role: 'user', content: prompt }] }) });
    const text = (await res.json()).choices?.[0]?.message?.content?.trim();
    return text ? { text, generated: true } : { text: fallback, generated: false };
  } catch { return { text: fallback, generated: false }; }
}

const phasesFor = name => [
  { id: 'bugfix', title: 'Bug Fix', prompt: `Read BUG_REPORT.md, then trace the code in ${name}. Form a hypothesis before asking the AI, find the root cause, and make the smallest correct fix. The visible tests already pass, so reproduce the problem yourself first.` },
  { id: 'tests', title: 'Regression Test', prompt: 'Add at least one test to the visible test file that fails on the original code and passes with your fix. Include an edge case beyond the one in the report.' },
  { id: 'review', title: 'Review', prompt: 'Find one other input or code path in this module that could break in a similar way. Fix it or explain precisely what you would change and how you would test it.' }
];

function writeBundle({ id, meta, files, hidden, patch }) {
  const dir = path.join(ROOT, 'src/challenges', id);
  fs.rmSync(dir, { recursive: true, force: true });
  const put = (rel, text) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  put('meta.json', JSON.stringify(meta, null, 2) + '\n');
  for (const [f, t] of Object.entries(files)) put(`files/${f}`, t);
  for (const [f, t] of Object.entries(hidden)) put(`hidden/${f}`, t);
  put('reference.patch', patch);
  return dir;
}

const difficulty = lines => lines <= 8 ? 'Easy' : lines <= 20 ? 'Mid' : 'Hard';
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function build() {
  const dir = clone(repoUrl), sha = git(dir, 'rev-parse', shaArg).trim();
  const v = await validate(dir, sha);
  if (!v.ok) throw new Error(`Not a valid challenge: ${v.reasons.join('; ')}`);
  const name = repoUrl.split('/').pop().replace(/\.git$/, '');
  const subject = git(dir, 'log', '-1', '--format=%s', sha).trim(), body = git(dir, 'log', '-1', '--format=%b', sha).trim();
  const testDiff = git(dir, 'diff', '--no-color', v.parent, sha, '--', ...v.tests);
  const report = await bugReport({ name, subject, body, patch: v.patch, testDiff });
  const files = { ...v.buggy, 'BUG_REPORT.md': `# Bug report\n\n${report.text}\n` };
  const license = Object.keys(files).find(f => /^LICENSE/i.test(f));
  const id = `${slug(name)}-${sha.slice(0, 7)}`;
  const meta = {
    id, title: name, difficulty: difficulty(v.lines), runner: 'suite', hasTests: true,
    entry: v.src[0], description: report.text.split('\n')[0],
    visibleTests: testFilesOf(v.buggy), failToPass: v.failToPass,
    origin: { kind: 'historical', repo: repoUrl, fixCommit: sha, license: license ? 'see LICENSE' : 'unknown' },
    reviewed: false, briefGenerated: report.generated, phases: phasesFor(v.src[0])
  };
  const out = writeBundle({ id, meta, files, hidden: v.hiddenFiles, patch: v.patch });
  console.log(`Wrote ${path.relative(ROOT, out)}  (${v.lines}-line fix, ${v.failToPass.length}/${v.total} hidden tests flip)\nReview BUG_REPORT.md, then set "reviewed": true in meta.json.`);
}

// ---- path B: injected bugs ---------------------------------------------------------------------------------------

const MUTATIONS = [
  [/ < /, ' <= ', 'boundary: < became <='], [/ <= /, ' < ', 'boundary: <= became <'],
  [/ > /, ' >= ', 'boundary: > became >='], [/ >= /, ' > ', 'boundary: >= became >'],
  [/ === /, ' !== ', 'equality inverted'], [/ !== /, ' === ', 'equality inverted'],
  [/ && /, ' || ', 'condition: && became ||'], [/ \|\| /, ' && ', 'condition: || became &&'],
  [/\+ 1\b/, '+ 0', 'off by one'], [/- 1\b/, '- 0', 'off by one'], [/\.length - 1\b/, '.length', 'off by one'],
  [/\bi\+\+/, 'i += 2', 'loop skips elements'], [/\.indexOf\(/, '.lastIndexOf(', 'wrong search direction']
];
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

/** Removes it()/specify() blocks whose full id is in `ids`. String/comment-aware paren matching; returns null if unsure. */
function stripTests(source, ids) {
  let out = source;
  for (const id of ids) {
    const title = id.split(' > ').pop();
    const re = new RegExp(`^[ \\t]*(?:it|specify)\\(\\s*(['"\`])${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`, 'm');
    const m = re.exec(out); if (!m) return null;
    let i = m.index + m[0].indexOf('('), depth = 0, quote = null;
    for (; i < out.length; i++) {
      const c = out[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
      if (c === '/' && out[i + 1] === '/') { i = out.indexOf('\n', i) - 1; continue; }
      if (c === '/' && out[i + 1] === '*') { i = out.indexOf('*/', i) + 1; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '(') depth++; else if (c === ')' && --depth === 0) break;
    }
    if (depth !== 0) return null;
    let end = i + 1; if (out[end] === ';') end++; if (out[end] === '\n') end++;
    out = out.slice(0, m.index) + out.slice(end);
  }
  return out;
}

async function inject() {
  const dir = clone(repoUrl), head = git(dir, 'rev-parse', 'HEAD').trim();
  const healthy = snapshot(dir, head), tests = testFilesOf(healthy);
  const base = await run(healthy, tests);
  if (base.length < 5 || base.some(t => t.outcome !== 'passed')) throw new Error('Healthy tests do not all pass in the shim runner; pick another repo.');
  const sources = Object.keys(healthy).filter(isSource), random = rng(SEED);
  for (let attempt = 0; attempt < 200; attempt++) {
    const file = sources[Math.floor(random() * sources.length)];
    const lines = healthy[file].split('\n');
    const idx = Math.floor(random() * lines.length), line = lines[idx];
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    const [re, to, label] = MUTATIONS[Math.floor(random() * MUTATIONS.length)];
    if (!re.test(line)) continue;
    const mutated = { ...healthy, [file]: [...lines.slice(0, idx), line.replace(re, to), ...lines.slice(idx + 1)].join('\n') };
    const results = await run(mutated, tests);
    if (results.some(t => t.id.startsWith('(load)') || t.id === '(crash)')) continue;
    const failing = results.filter(t => t.outcome === 'failed').map(t => t.id);
    if (!failing.length || failing.length > Math.max(3, base.length / 3)) continue; // must be catchable, but not a crater
    const visibleTests = {};
    for (const f of tests) { const s = stripTests(healthy[f], failing.filter(id => base.some(b => b.id === id))); if (s === null) { visibleTests.__bad = true; break; } visibleTests[f] = s; }
    if (visibleTests.__bad) continue;
    const visibleRun = await run({ ...mutated, ...visibleTests }, tests);
    if (visibleRun.some(t => t.outcome !== 'passed')) continue;
    const name = repoUrl.split('/').pop().replace(/\.git$/, ''), id = `${slug(name)}-inj-${SEED}`;
    const patch = `--- a/${file}\n+++ b/${file}\n@@ -${idx + 1} +${idx + 1} @@ (${label})\n-${mutated[file].split('\n')[idx]}\n+${line}\n`;
    const report = await bugReport({ name, subject: `${label} in ${file}`, body: `Failing behaviours: ${failing.join('; ')}`, patch, testDiff: '' });
    const meta = {
      id, title: name, difficulty: 'Mid', runner: 'suite', hasTests: true, entry: file, description: report.text.split('\n')[0],
      visibleTests: tests, failToPass: failing,
      origin: { kind: 'injected', repo: repoUrl, baseCommit: head, mutation: label, license: 'see LICENSE' },
      reviewed: false, briefGenerated: report.generated, phases: phasesFor(file)
    };
    const hidden = Object.fromEntries(tests.map(f => [f, healthy[f]]));
    const files = { ...mutated, ...visibleTests, 'BUG_REPORT.md': `# Bug report\n\n${report.text}\n` };
    const out = writeBundle({ id, meta, files, hidden, patch });
    console.log(`Wrote ${path.relative(ROOT, out)}  (${label} in ${file}:${idx + 1}; ${failing.length}/${base.length} tests catch it)\nReview BUG_REPORT.md, then set "reviewed": true in meta.json.`);
    return;
  }
  throw new Error('No viable mutation found; try another --seed.');
}

const commands = { scan, build, inject };
if (!commands[command] || !repoUrl || (command === 'build' && !shaArg)) {
  console.error('usage: ingest.mjs scan|build|inject <repoUrl> [fixSha] [--work DIR] [--seed N]'); process.exit(2);
}
await commands[command]();
