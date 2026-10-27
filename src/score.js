// Legacy retry-queue weights; mirrors TESTS and score() in src/evaluation.js.
export const TESTS = [
  { id: 'success', description: 'Successful job completes once', points: 4 },
  { id: 'retry', description: 'A failed job retries and completes', points: 8 },
  { id: 'overlap', description: 'Retries do not execute concurrently or duplicate', points: 12 },
  { id: 'exhaustion', description: 'Attempts stop at the configured limit', points: 7 },
  { id: 'duplicate', description: 'Duplicate IDs are rejected', points: 4 }
];

const FAIL_TO_PASS_WEIGHT = 3; // tests that expose the bug count three times a regression guard

export function testPoints(challenge, id) {
  if (!challenge || challenge.runner !== 'suite') return TESTS.find(x => x.id === id)?.points ?? 0;
  return challenge.failToPass?.includes(id) ? FAIL_TO_PASS_WEIGHT : 1;
}
export function testLabel(challenge, id) {
  return (!challenge || challenge.runner !== 'suite') ? TESTS.find(x => x.id === id)?.description || id : id;
}

export function score(tests, status, challenge) {
  if (status !== 'completed' || !tests || tests.some(t => t.outcome === 'skipped' || t.outcome === 'error')) return null;
  const totalPoints = tests.reduce((n, t) => n + testPoints(challenge, t.id), 0);
  if (!totalPoints) return null;
  const passedPoints = tests.filter(t => t.outcome === 'passed').reduce((n, t) => n + testPoints(challenge, t.id), 0);
  return { passedPoints, totalPoints, correctness: Math.round(3500 * passedPoints / totalPoints) / 100 };
}
