// Legacy retry-queue weights; mirrors TESTS and score() in src/evaluation.js.
export const TESTS = [
  { id: 'success', description: 'Successful job completes once', points: 4 },
  { id: 'retry', description: 'A failed job retries and completes', points: 8 },
  { id: 'overlap', description: 'Retries do not execute concurrently or duplicate', points: 12 },
  { id: 'exhaustion', description: 'Attempts stop at the configured limit', points: 7 },
  { id: 'duplicate', description: 'Duplicate IDs are rejected', points: 4 }
];

export const testLabel = (challenge, id) => challenge?.runner === 'suite' ? id : TESTS.find(x => x.id === id)?.description || id;

// Legacy (retry-queue) scoring, run in the browser. Suite challenges are scored by the server and arrive as run.score.
export function score(tests, status) {
  if (status !== 'completed' || !tests || tests.some(t => t.outcome === 'skipped' || t.outcome === 'error')) return null;
  const totalPoints = TESTS.reduce((n, t) => n + t.points, 0);
  const passedPoints = tests.filter(t => t.outcome === 'passed').reduce((n, t) => n + (TESTS.find(x => x.id === t.id)?.points ?? 0), 0);
  return { passedPoints, totalPoints, correctness: Math.round(3500 * passedPoints / totalPoints) / 100 };
}
