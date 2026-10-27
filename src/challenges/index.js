const metas = import.meta.glob('./*/meta.json', { eager: true, import: 'default' });
const sources = import.meta.glob('./*/files/**/*', { eager: true, query: '?raw', import: 'default' });
// Hidden tests, the reference fix and grading data (grading.json) are never imported here, so they are not in the browser bundle.
// They live in the same folder and are read only by the server (api/_lib/challenges.js).

const collect = (sourceMap, prefix) => {
  const out = {};
  for (const [path, content] of Object.entries(sourceMap)) if (path.startsWith(prefix)) out[path.slice(prefix.length)] = content;
  return out;
};

// Bundles from the ingest pipeline carry reviewed:false until a human has read the bug report and the reference fix.
export const challenges = Object.entries(metas)
  .filter(([, meta]) => meta.reviewed !== false)
  .map(([metaPath, meta]) => {
    const base = metaPath.replace('meta.json', '');
    return { ...meta, files: collect(sources, `${base}files/`) };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

export const findChallenge = id => challenges.find(c => c.id === id);

/** Random assignment that avoids the most recent cases when there is a choice. `recent` is a list of ids, newest last. */
export function drawChallenge(recent = [], random = Math.random) {
  const fresh = challenges.filter(c => !recent.slice(-Math.min(2, challenges.length - 1)).includes(c.id));
  const pool = fresh.length ? fresh : challenges;
  return pool[Math.floor(random() * pool.length)];
}
