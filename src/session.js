import { findChallenge } from './challenges/index.js';
import { saveRemoteSession, clearRemoteSession } from './api.js';

// The round is cached in this browser for instant reloads and mirrored to the server, so it follows the user to another device.
// The cache is scoped to the signed-in email via setSessionOwner().
let owner = 'guest';
export const setSessionOwner = email => { owner = email || 'guest'; };
const key = () => `codebaseDetective.session.v4.${owner}`;
const RECENT_KEY = 'codebaseDetective.recentCases';
export const DURATIONS = [
  { minutes: 10, label: 'Quick check', phases: 1, blurb: 'Find and fix one bug.' },
  { minutes: 30, label: 'Standard', phases: 2, blurb: 'Fix the bug, then prove it with a test.' },
  { minutes: 60, label: 'Full round', phases: 3, blurb: 'Fix, test and review the whole module.' }
];
export const DEFAULT_MINUTES = 30;
export const emptyAnswers = { rootCause: '', implementation: '', verification: '', aiSupervision: '' };

const valid = session => session && findChallenge(session.challengeId) ? session : null;
export function loadSession() {
  try { return valid(JSON.parse(localStorage.getItem(key()))); } catch { return null; }
}
/** Picks the newer of the local copy and the server copy. */
export function mergeRemoteSession(local, remote) {
  const usable = valid(remote);
  if (!usable) return local;
  return !local || (usable.updatedAt ?? 0) > (local.updatedAt ?? 0) ? usable : local;
}

let timer, pending;
function flush() {
  const session = pending; pending = undefined; timer = undefined;
  (session === null ? clearRemoteSession() : saveRemoteSession(session)).catch(() => { /* offline: the local copy still holds the work and syncs on the next change */ });
}
export function saveSession(session) {
  const stamped = session ? { ...session, updatedAt: Date.now() } : null;
  try { stamped ? localStorage.setItem(key(), JSON.stringify(stamped)) : localStorage.removeItem(key()); } catch { /* storage unavailable: session stays in memory */ }
  pending = stamped; clearTimeout(timer);
  timer = setTimeout(flush, stamped ? 1500 : 0);
}
export function flushSessionNow() { if (timer) { clearTimeout(timer); flush(); } }

export function recentCases() {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY)); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function rememberCase(id) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([...recentCases().filter(x => x !== id), id].slice(-5))); } catch { /* ignore */ }
}

/** Shorter rounds cover fewer phases, so a 10 minute round is one focused bug, not three rushed tasks. */
export const phasesForMinutes = (challenge, minutes) => challenge.phases.slice(0, DURATIONS.find(d => d.minutes === minutes)?.phases ?? challenge.phases.length);

export function newSession(challenge, minutes = DEFAULT_MINUTES) {
  const startedAt = Date.now(), phases = phasesForMinutes(challenge, minutes);
  return {
    id: crypto.randomUUID(), challengeId: challenge.id, minutes, startedAt, deadlineAt: startedAt + minutes * 60000, status: 'RUNNING',
    files: { ...challenge.files }, openTabs: [challenge.entry], active: challenge.entry,
    phase: 0, phases: phases.map((p, i) => ({ id: p.id, title: p.title, prompt: p.prompt, startedAt: i === 0 ? startedAt : null, completedAt: null })),
    runs: [], chat: [], chatClearedAt: 0, narration: [], answers: { ...emptyAnswers }, submission: null, report: null
  };
}
