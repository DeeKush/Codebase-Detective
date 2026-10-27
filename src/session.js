import { findChallenge } from './challenges/index.js';
import { currentUser } from './auth.js';

// One saved round per signed-in user, so people sharing a browser never see each other's work.
const key = () => `codebaseDetective.session.v3.${currentUser()?.email ?? 'guest'}`;
const RECENT_KEY = 'codebaseDetective.recentCases';
export const DURATIONS = [
  { minutes: 10, label: 'Quick check', phases: 1, blurb: 'Find and fix one bug.' },
  { minutes: 30, label: 'Standard', phases: 2, blurb: 'Fix the bug, then prove it with a test.' },
  { minutes: 60, label: 'Full round', phases: 3, blurb: 'Fix, test and review the whole module.' }
];
export const DEFAULT_MINUTES = 30;
export const emptyAnswers = { rootCause: '', implementation: '', verification: '', aiSupervision: '' };

export function loadSession() {
  try {
    const session = JSON.parse(localStorage.getItem(key()));
    return session && findChallenge(session.challengeId) ? session : null;
  } catch { return null; }
}
export function saveSession(session) {
  try { session ? localStorage.setItem(key(), JSON.stringify(session)) : localStorage.removeItem(key()); } catch { /* storage unavailable: session stays in memory */ }
}
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
